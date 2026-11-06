// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {INightTypes} from "../../../src/interfaces/INightTypes.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {SwapParams, ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";

contract FactoryDouble is INightTypes {
    function notifyCutoffSettled(bytes32) external {}
    NightConfig private cfg;
    PoolKey private key;
    address private token;
    bool public complete = true;

    function setup(NightConfig memory c, PoolKey memory k, address t) external {
        cfg = c;
        key = k;
        token = t;
    }

    function config(bytes32 n) external view returns (NightConfig memory) {
        require(n == cfg.night);
        return cfg;
    }

    function poolKey(bytes32) external view returns (PoolKey memory) {
        return key;
    }

    function tokenOf(bytes32) external view returns (address) {
        return token;
    }

    function ownerOf(bytes32) external view returns (address) {
        return cfg.host;
    }

    function ladderComplete(bytes32) external view returns (bool) {
        return complete;
    }

    function setComplete(bool value) external {
        complete = value;
    }
}

contract BookingDouble is INightTypes {
    mapping(bytes32 => Booking) private records;

    function set(bytes32 id, Booking memory b) external {
        records[id] = b;
    }

    function booking(bytes32 id) external view returns (Booking memory) {
        return records[id];
    }
}

contract TokenDouble {
    uint256 public burned;
    mapping(address => uint256) private balances;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => uint256) public cutoffBalanceOf;
    mapping(address => address) public cutoffNext;
    uint256 public held;
    address public first;
    address public settlement;
    bool public frozen;
    bool public dustBurned;
    uint256 public inventoryBurned;

    function setSettlement(address s) external {
        settlement = s;
    }

    function markHolder(address a) external {
        cutoffBalanceOf[a] = balances[a];
        held += balances[a];
        cutoffNext[a] = first;
        first = a;
    }

    function balanceOf(address a) public view returns (uint256) {
        return frozen && cutoffBalanceOf[a] != 0 ? 0 : balances[a];
    }

    function mint(address a, uint256 n) external {
        balances[a] += n;
    }

    function approve(address a, uint256 n) external returns (bool) {
        allowance[msg.sender][a] = n;
        return true;
    }

    function transfer(address a, uint256 n) external returns (bool) {
        _move(msg.sender, a, n);
        return true;
    }

    function transferFrom(address a, address b, uint256 n) external returns (bool) {
        if (allowance[a][msg.sender] != type(uint256).max) allowance[a][msg.sender] -= n;
        _move(a, b, n);
        return true;
    }

    function _move(address a, address b, uint256 n) private {
        require(balanceOf(a) >= n);
        balances[a] -= n;
        balances[b] += n;
    }

    function snapshotAtCutoff() external returns (uint256, address) {
        require(msg.sender == settlement && !frozen);
        frozen = true;
        balances[settlement] += held;
        return (held, first);
    }

    function burnVaultDust() external returns (uint256) {
        require(msg.sender == settlement);
        dustBurned = true;
        return 0;
    }

    function burnCutoffInventory() external returns (uint256 n) {
        require(msg.sender == settlement);
        n = balances[settlement];
        balances[settlement] = 0;
        inventoryBurned += n;
    }
}

contract VaultDouble {
    IPoolManager public manager;
    PoolKey private key;
    address public settlement;
    address public usdc;
    mapping(bytes32 => uint256) public pending;
    int256 public liquidity;

    constructor(IPoolManager m, address u) {
        manager = m;
        usdc = u;
    }

    function setup(PoolKey memory k, address s) external {
        key = k;
        settlement = s;
    }

    function add(int256 l) external {
        liquidity = l;
        manager.unlock(abi.encode(l));
    }

    function collectEarned(bytes32) external pure returns (uint256) { return 0; }

    function creditPending(bytes32 p, uint256 n) external {
        SafeTransferLib.safeTransferFrom(usdc, msg.sender, address(this), n);
        pending[p] += n;
    }

    function payPending(bytes32 p, address guest, uint256 n) external returns (uint256) {
        require(msg.sender == settlement);
        uint256 paid = n < pending[p] ? n : pending[p];
        pending[p] -= paid;
        SafeTransferLib.safeTransfer(usdc, guest, paid);
        return paid;
    }

    function releaseAtCutoff(bytes32) external returns (uint256 u, uint256 t) {
        require(msg.sender == settlement);
        if (liquidity != 0) {
            (u, t) = abi.decode(manager.unlock(abi.encode(-liquidity)), (uint256, uint256));
            liquidity = 0;
        }
        if (u != 0) SafeTransferLib.safeTransfer(usdc, settlement, u);
        if (t != 0) SafeTransferLib.safeTransfer(Currency.unwrap(key.currency0), settlement, t);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(manager));
        (BalanceDelta d,) =
            manager.modifyLiquidity(key, ModifyLiquidityParams(-300000, -200000, abi.decode(data, (int256)), 0), "");
        _settle(key.currency0, d.amount0());
        _settle(key.currency1, d.amount1());
        return abi.encode(
            d.amount1() > 0 ? uint256(uint128(d.amount1())) : 0, d.amount0() > 0 ? uint256(uint128(d.amount0())) : 0
        );
    }

    function _settle(Currency c, int128 d) private {
        if (d < 0) {
            manager.sync(c);
            SafeTransferLib.safeTransfer(Currency.unwrap(c), address(manager), uint256(-int256(d)));
            manager.settle();
        } else if (d > 0) {
            manager.take(c, address(this), uint256(uint128(d)));
        }
    }

    function approveDebt() external {
        SafeTransferLib.safeApprove(usdc, settlement, type(uint256).max);
    }
}

/// @notice Test-only facade retaining MockUSDC's implementation and adding recipient failures.
contract BlacklistUSDC {
    address public immutable underlying;
    mapping(address => bool) public blocked;

    constructor(address u) {
        underlying = u;
    }

    function setBlocked(address a, bool b) external {
        blocked[a] = b;
    }

    fallback() external {
        if (msg.sig == bytes4(keccak256("transfer(address,uint256)"))) {
            (address to,) = abi.decode(msg.data[4:], (address, uint256));
            require(!blocked[to], "blacklisted");
        }
        (bool ok, bytes memory result) = underlying.delegatecall(msg.data);
        assembly {
            if iszero(ok) { revert(add(result, 32), mload(result)) }
            return(add(result, 32), mload(result))
        }
    }
}

contract SwapDouble {
    IPoolManager immutable manager;

    constructor(IPoolManager m) {
        manager = m;
    }

    function buy(PoolKey memory k, uint256 qty) external {
        manager.unlock(abi.encode(k, qty, msg.sender));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(manager));
        (PoolKey memory k, uint256 qty, address payer) = abi.decode(data, (PoolKey, uint256, address));
        BalanceDelta d = manager.swap(k, SwapParams(false, int256(qty), TickMath.MAX_SQRT_PRICE - 1), "");
        require(d.amount0() == int256(qty));
        manager.sync(k.currency1);
        SafeTransferLib.safeTransferFrom(
            Currency.unwrap(k.currency1), payer, address(manager), uint256(-int256(d.amount1()))
        );
        manager.settle();
        manager.take(k.currency0, payer, qty);
        return "";
    }
}
