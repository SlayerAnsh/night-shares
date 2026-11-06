// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {INightVault} from "./interfaces/INightVault.sol";
import {INightFactory} from "./interfaces/INightFactory.sol";
import {INightToken} from "./interfaces/INightToken.sol";
import {ISettlement} from "./interfaces/ISettlement.sol";
import {LadderMath} from "./libraries/LadderMath.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {SqrtPriceMath} from "v4-core/src/libraries/SqrtPriceMath.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";

import {NightPosition} from "./libraries/NightPosition.sol";

contract NightVault is INightVault {
    using SafeTransferLib for address;
    IPoolManager public immutable manager;
    INightFactory public immutable factory;
    address public immutable usdc;
    address public immutable settlement;
    mapping(bytes32 => uint256) public nextRoom;
    mapping(bytes32 => bool) public ladderComplete;
    mapping(bytes32 => uint256) public pending;
    mapping(bytes32 => bool) public closing;
    mapping(bytes32 => bool) public opened;
    mapping(bytes32 => bool) public closed;
    mapping(bytes32 => mapping(uint256 => bool)) public removed;
    bool private entered;
    bool private unlocking;
    bytes32 private operationHash;

    constructor(address factory_, address manager_, address usdc_, address settlement_) {
        if (factory_ == address(0) || manager_ == address(0) || usdc_ == address(0) || settlement_ == address(0)) {
            revert InvalidConfig();
        }
        factory = INightFactory(factory_);
        manager = IPoolManager(manager_);
        usdc = usdc_;
        settlement = settlement_;
    }
    modifier guard() {
        if (entered) revert Reentrancy();
        entered = true;
        _;
        entered = false;
    }

    /// @notice Factory must mint this total to the vault before opening the night.
    function requiredInventory(NightConfig memory c) public pure returns (uint256 total) {
        LadderMath.priceWad(c.F, c.k, c.S, 0);
        for (uint256 i; i < c.S / 1e18; ++i) {
            (,,, uint256 deposit) = NightPosition.room(c.F, c.k, c.S, i);
            total += deposit;
        }
    }

    function dust(bytes32 night) external view returns (uint256) {
        if (!opened[night]) return 0;
        return INightToken(factory.tokenOf(night)).balanceOf(address(this));
    }

    function openNight(bytes32 night) external guard {
        if (msg.sender != address(factory)) revert Unauthorized();
        if (opened[night]) revert AlreadyOpened(night);
        NightConfig memory c = factory.config(night);
        if (block.timestamp >= c.cutoff) revert CutoffReached();
        uint256 inventory = requiredInventory(c);
        if (INightToken(factory.tokenOf(night)).balanceOf(address(this)) != inventory) revert InvalidQuantity();
        opened[night] = true;
    }

    function addLadderChunk(bytes32 night, uint256 fromRoom, uint256 toRoom) external guard {
        if (msg.sender != address(factory)) revert Unauthorized();
        _known(night);
        NightConfig memory c = factory.config(night);
        if (block.timestamp >= c.cutoff || closed[night]) revert CutoffReached();
        if (fromRoom != nextRoom[night] || fromRoom >= toRoom || toRoom > c.S / 1e18) revert InvalidChunk();
        _unlock(night, fromRoom, toRoom, 0);
        nextRoom[night] = toRoom;
        ladderComplete[night] = toRoom == c.S / 1e18;
    }

    function sweep(bytes32 night) external guard returns (uint256 amount, uint256 hostDebtNetted) {
        _known(night);
        if (closed[night]) revert CutoffReached();
        NightConfig memory c = factory.config(night);
        uint256 end = INightToken(factory.tokenOf(night)).burned() / 1e18;
        if (end > nextRoom[night]) end = nextRoom[night];
        (amount,) = abi.decode(_unlock(night, 0, end, 1), (uint256, uint256));
        pending[c.property] += amount;
        uint256 available = pending[c.property];
        pending[c.property] = 0;
        if (available != 0) {
            usdc.safeApprove(settlement, available);
            hostDebtNetted = ISettlement(settlement).netDebt(c.host, available);
            usdc.safeApprove(settlement, 0);
            if (hostDebtNetted > available) revert InvalidQuantity();
            usdc.safeTransfer(c.host, available - hostDebtNetted);
        }
        emit Swept(c.property, c.host, available, hostDebtNetted);
    }

    function creditPending(bytes32 property, uint256 amount) external guard {
        if (factory.ownerOf(property) == address(0)) revert InvalidConfig();
        pending[property] += amount;
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    function payPending(bytes32 property, address guest, uint256 requested) external guard returns (uint256 paid) {
        if (msg.sender != settlement) revert Unauthorized();
        if (guest == address(0)) revert InvalidConfig();
        paid = requested < pending[property] ? requested : pending[property];
        pending[property] -= paid;
        if (paid != 0) usdc.safeTransfer(guest, paid);
    }

    function releaseAtCutoff(bytes32 night) external guard returns (uint256 usdcAmount, uint256 tokens) {
        if (msg.sender != settlement) revert Unauthorized();
        _known(night);
        if (block.timestamp < factory.config(night).cutoff) revert BeforeCutoff();
        if (closed[night]) revert CutoffReached();
        closed[night] = true;
        closing[night] = true;
        (usdcAmount,) = abi.decode(_unlock(night, 0, nextRoom[night], 2), (uint256, uint256));
        closing[night] = false;
        address token = factory.tokenOf(night);
        uint256 balance = INightToken(token).balanceOf(address(this));
        // Settlement burns this excluded remainder through NightToken.burnVaultDust
        // after all positions are removed. It must also burn the pool's rounding residue.
        uint256 roundingDust = balance % 1e17;
        tokens = balance - roundingDust;
        if (usdcAmount != 0) usdc.safeTransfer(settlement, usdcAmount);
        if (tokens != 0) token.safeTransfer(settlement, tokens);
    }

    function _known(bytes32 night) private view {
        if (!opened[night]) revert UnknownNight(night);
    }

    function _unlock(bytes32 night, uint256 from, uint256 to, uint8 mode) private returns (bytes memory result) {
        bytes memory data = abi.encode(night, from, to, mode);
        operationHash = keccak256(data);
        unlocking = true;
        result = manager.unlock(data);
        unlocking = false;
        operationHash = bytes32(0);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(manager) || !unlocking || keccak256(data) != operationHash) revert Unauthorized();
        unlocking = false;
        (bytes32 night, uint256 from, uint256 to, uint8 mode) = abi.decode(data, (bytes32, uint256, uint256, uint8));
        NightConfig memory c = factory.config(night);
        PoolKey memory key = factory.poolKey(night);
        int256 amount0;
        int256 amount1;
        for (uint256 i = from; i < to; ++i) {
            if (mode != 0 && removed[night][i]) continue;
            (int24 lower, int24 upper, uint128 l,) = NightPosition.room(c.F, c.k, c.S, i);
            if (mode != 0) removed[night][i] = true;
            (BalanceDelta d,) = manager.modifyLiquidity(
                key,
                ModifyLiquidityParams(lower, upper, mode == 0 ? int256(uint256(l)) : -int256(uint256(l)), bytes32(i)),
                abi.encode(night)
            );
            amount0 += d.amount0();
            amount1 += d.amount1();
        }
        _settle(key.currency0, amount0);
        _settle(key.currency1, amount1);
        return abi.encode(amount1 > 0 ? uint256(amount1) : 0, amount0 > 0 ? uint256(amount0) : 0);
    }

    function _settle(Currency currency, int256 delta) private {
        if (delta < 0) {
            manager.sync(currency);
            Currency.unwrap(currency).safeTransfer(address(manager), uint256(-delta));
            manager.settle();
        } else if (delta > 0) {
            manager.take(currency, address(this), uint256(delta));
        }
    }
}
