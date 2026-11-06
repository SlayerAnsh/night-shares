// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {IRebatePool} from "./interfaces/IRebatePool.sol";
import {INightFactory} from "./interfaces/INightFactory.sol";
import {FeeMath} from "./libraries/FeeMath.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";

contract RebatePool is IRebatePool {
    bool private entered;
    modifier nonReentrant() {
        if (entered) revert Reentrancy();
        entered = true;
        _;
        entered = false;
    }
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;
    address public immutable usdc;
    address public immutable tradeRouter;
    address public immutable bookingRouter;
    INightFactory public immutable factory;
    IPoolManager public immutable manager;

    constructor(address usdc_, address manager_, address factory_, address trade_, address booking_) {
        if (
            usdc_ == address(0) || manager_ == address(0) || factory_ == address(0) || trade_ == address(0)
                || booking_ == address(0)
        ) revert InvalidConfig();
        usdc = usdc_;
        manager = IPoolManager(manager_);
        factory = INightFactory(factory_);
        tradeRouter = trade_;
        bookingRouter = booking_;
    }

    function balance() public view returns (uint256) {
        return SafeTransferLib.balanceOf(usdc, address(this));
    }

    function deposit(uint256 amount) external nonReentrant {
        SafeTransferLib.safeTransferFrom(usdc, msg.sender, address(this), amount);
    }

    function payMaker(bytes32 night, address maker, uint256 askPrice, uint256 qty)
        external
        nonReentrant
        returns (uint256 paid)
    {
        if (msg.sender != tradeRouter && msg.sender != bookingRouter) revert Unauthorized();
        if (maker == address(0) || qty == 0 || qty % 1e17 != 0) revert InvalidQuantity();
        NightConfig memory config = factory.config(night);
        if (block.timestamp >= config.cutoff) revert CutoffReached();
        if (!factory.ladderComplete(night)) revert LadderIncomplete();
        PoolKey memory key = factory.poolKey(night);
        if (Currency.unwrap(key.currency0) != factory.tokenOf(night) || Currency.unwrap(key.currency1) != usdc) {
            revert InvalidConfig();
        }
        (uint160 sqrtPrice,,,) = manager.getSlot0(key.toId());
        if (sqrtPrice == 0) revert InvalidConfig();
        // Keep full precision for the supported price range; use Q128 for large ratios.
        uint256 price;
        if (sqrtPrice <= type(uint128).max) {
            price = FullMath.mulDiv(uint256(sqrtPrice) * sqrtPrice, 1e18, 1 << 192);
        } else {
            uint256 ratioX128 = FullMath.mulDiv(sqrtPrice, sqrtPrice, 1 << 64);
            price = FullMath.mulDiv(ratioX128, 1e18, 1 << 128);
        }
        paid = FeeMath.makerRebate(askPrice, price, qty, balance());
        if (paid != 0) SafeTransferLib.safeTransfer(usdc, maker, paid);
    }
}
