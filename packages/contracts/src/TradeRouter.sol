// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IRouterCore} from "./interfaces/IRouterCore.sol";
import {ITradeRouter} from "./interfaces/ITradeRouter.sol";
import {INightTypes} from "./interfaces/INightTypes.sol";
import {INightFactory} from "./interfaces/INightFactory.sol";
import {INightToken} from "./interfaces/INightToken.sol";
import {INightHook} from "./interfaces/INightHook.sol";
import {IHumanRegistry} from "./interfaces/IHumanRegistry.sol";
import {IRebatePool} from "./interfaces/IRebatePool.sol";
import {OrderLib} from "./libraries/OrderLib.sol";
import {FeeMath} from "./libraries/FeeMath.sol";
import {LadderMath} from "./libraries/LadderMath.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {Pool} from "v4-core/src/libraries/Pool.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {SignatureCheckerLib} from "solady/utils/SignatureCheckerLib.sol";

import {IRouterSender} from "./interfaces/IRouterSender.sol";

/// @dev Shared custody and exact-output routing. Each pool leg is a whole tenth.
abstract contract RouterCore is INightTypes, IRouterCore {
    using SafeTransferLib for address;

    uint256 internal constant TENTH = 1e17;
    INightFactory public immutable factory;
    IPoolManager public immutable poolManager;
    address public immutable usdc;
    IAllowanceTransfer public immutable permit2;
    IHumanRegistry public immutable registry;
    INightHook public immutable hook;
    bool internal immutable bookingRoute;
    address internal activeUser;
    bytes32 private activeUnlock;

    error QuoteResult(uint256 paid);
    error UnexpectedQuote();

    constructor(address factory_, Deployment memory d, bool booking_) {
        if (
            factory_ == address(0) || d.poolManager == address(0) || d.usdc == address(0) || d.permit2 == address(0)
                || d.registry == address(0) || d.hook == address(0)
        ) revert InvalidConfig();
        factory = INightFactory(factory_);
        poolManager = IPoolManager(d.poolManager);
        usdc = d.usdc;
        permit2 = IAllowanceTransfer(d.permit2);
        registry = IHumanRegistry(d.registry);
        hook = INightHook(d.hook);
        bookingRoute = booking_;
    }

    modifier execution() {
        if (activeUser != address(0)) revert Reentrancy();
        activeUser = msg.sender;
        _;
        activeUser = address(0);
    }

    function _check(bytes32 night, uint256 qty, uint64 deadline) internal view returns (NightConfig memory c) {
        if (block.timestamp > deadline) revert Expired();
        if (qty == 0 || qty % TENTH != 0 || qty > 100e18) revert InvalidQuantity();
        if (factory.tokenOf(night) == address(0)) revert UnknownNight(night);
        c = factory.config(night);
        if (block.timestamp >= c.cutoff) revert CutoffReached();
        if (!factory.ladderComplete(night)) revert LadderIncomplete();
        if (hook.paused() || INightToken(factory.tokenOf(night)).paused()) revert Paused();
    }

    function _pull(address to, uint256 amount) internal {
        if (amount > type(uint160).max) revert Slippage();
        if (amount != 0) permit2.transferFrom(activeUser, to, uint160(amount), usdc);
    }

    function _limit(bytes32 night, uint256 price) internal view returns (uint160) {
        NightConfig memory c = factory.config(night);
        uint160 upper = TickMath.getSqrtPriceAtTick(LadderMath.boundaryTick(c.F, c.k, c.S, c.S));
        // No liquidity exists beyond the final ladder boundary. Avoid scanning empty ticks.
        if (price >= LadderMath.priceWad(c.F, c.k, c.S, c.S) / 1e18 + 1) return upper;
        uint160 requested = LadderMath.sqrtPriceX96(price * 1e18);
        return requested < upper ? requested : upper;
    }

    function _swap(bytes32 night, uint256 qty, bool sell_, uint160 limit, bool quote)
        internal
        returns (uint256 amount)
    {
        uint256 funding;
        if (!sell_ && !quote) {
            (bool available, uint256 cost) = _quote(night, qty, limit);
            if (!available) revert SoldOut();
            funding = cost;
        }
        return _swapFunded(night, qty, sell_, limit, quote, funding);
    }

    function _swapFunded(bytes32 night, uint256 qty, bool sell_, uint160 limit, bool quote, uint256 funding)
        private
        returns (uint256 amount)
    {
        bytes memory data = abi.encode(night, qty, sell_, limit, quote, funding);
        activeUnlock = keccak256(data);
        amount = abi.decode(poolManager.unlock(data), (uint256));
        activeUnlock = bytes32(0);
    }

    /// @dev Self-call makes a reverting quote roll back all hook and pool writes.
    function quotePool(bytes32 night, uint256 qty, uint160 limit) external {
        if (msg.sender != address(this) || activeUser == address(0)) revert Unauthorized();
        _swap(night, qty, false, limit, true);
        revert UnexpectedQuote();
    }

    function _quote(bytes32 night, uint256 qty, uint160 limit) internal returns (bool available, uint256 cost) {
        try this.quotePool(night, qty, limit) {
            revert UnexpectedQuote();
        } catch (bytes memory reason) {
            if (reason.length == 36 && bytes4(reason) == QuoteResult.selector) {
                assembly ("memory-safe") { cost := mload(add(reason, 36)) }
                return (true, cost);
            }
            // Only an exhausted price range may trigger an ask or recall fallback.
            // Hook policy failures and unexpected dependency errors must remain failures.
            if (
                (reason.length == 4 && bytes4(reason) == SoldOut.selector)
                    || (reason.length == 68 && bytes4(reason) == Pool.PriceLimitAlreadyExceeded.selector)
            ) {
                return (false, 0);
            }
            assembly ("memory-safe") { revert(add(reason, 32), mload(reason)) }
        }
    }

    function _callback(bytes calldata data) internal returns (bytes memory) {
        if (
            msg.sender != address(poolManager) || activeUser == address(0) || activeUnlock == bytes32(0)
                || activeUnlock != keccak256(data)
        ) revert Unauthorized();
        activeUnlock = bytes32(0);
        (bytes32 night, uint256 qty, bool sell_, uint160 limit, bool quote, uint256 funding) =
            abi.decode(data, (bytes32, uint256, bool, uint160, bool, uint256));
        PoolKey memory key = factory.poolKey(night);
        if (Currency.unwrap(key.currency0) != factory.tokenOf(night) || Currency.unwrap(key.currency1) != usdc) {
            revert InvalidConfig();
        }
        uint256 prepaid;
        if (!sell_) {
            // Pre-settle available cash so the hook can distribute fees on the first buy.
            // Limit the temporary pull to the price ceiling and refund unused credit.
            NightConfig memory c = factory.config(night);
            uint256 bound = OrderLib.fillCost(qty, LadderMath.priceWad(c.F, c.k, c.S, c.S) / 1e18 + 1);
            bound += FeeMath.halfUp(bound, 130, 10000) + 100;
            (uint160 allowed, uint48 expiration,) = permit2.allowance(activeUser, usdc, address(this));
            uint256 available = usdc.balanceOf(activeUser);
            prepaid = available < bound ? available : bound;
            if (prepaid > allowed) prepaid = allowed;
            if (expiration < block.timestamp) prepaid = 0;
            // The provisional pull exists only inside the reverting quote. Execution
            // consumes exactly the quoted payment from the user's Permit2 allowance.
            if (!quote) prepaid = funding;
            if (prepaid != 0) {
                poolManager.sync(key.currency1);
                _pull(address(poolManager), prepaid);
                poolManager.settle();
            }
        }
        BalanceDelta delta = poolManager.swap(
            key,
            SwapParams(sell_, sell_ ? -int256(qty) : int256(qty), limit),
            abi.encode(SwapContext(night, activeUser, bookingRoute))
        );
        int256 tokenDelta = delta.amount0();
        int256 cashDelta = delta.amount1();
        if (tokenDelta != (sell_ ? -int256(qty) : int256(qty))) {
            if (sell_) revert Slippage();
            revert SoldOut();
        }
        if ((sell_ && cashDelta < 0) || (!sell_ && cashDelta > 0)) revert Slippage();
        uint256 amount = uint256(sell_ ? cashDelta : -cashDelta);
        if (quote) revert QuoteResult(amount);
        if (sell_) {
            poolManager.sync(key.currency0);
            Currency.unwrap(key.currency0).safeTransfer(address(poolManager), qty);
            poolManager.settle();
            poolManager.take(key.currency1, activeUser, amount);
        } else {
            if (amount > prepaid) {
                poolManager.sync(key.currency1);
                _pull(address(poolManager), amount - prepaid);
                poolManager.settle();
            } else if (prepaid > amount) {
                poolManager.take(key.currency1, activeUser, prepaid - amount);
            }
            poolManager.take(key.currency0, address(this), qty);
        }
        return abi.encode(amount);
    }

    /// @dev A pool tenth must fit entirely below the next ask/strike. This respects
    /// tenth granularity without leaving fractional user inventory at a price boundary.
    function _route(bytes32 night, uint256 qty, uint256 maxPaid, Ask[] memory asks, uint256 ceiling)
        internal
        returns (uint256 paid, uint256 missing)
    {
        if (asks.length == 0 && ceiling == type(uint256).max) {
            paid = _swap(night, qty, false, _limit(night, ceiling), false);
            if (paid > maxPaid) revert Slippage();
            return (paid, 0);
        }
        uint256[] memory remaining = new uint256[](asks.length);
        for (uint256 i; i < asks.length; ++i) {
            if (asks[i].order.night != night || asks[i].order.price == 0) revert InvalidConfig();
            if (asks[i].qty == 0 || asks[i].qty % TENTH != 0) revert InvalidQuantity();
            remaining[i] = asks[i].qty;
        }
        missing = qty;
        while (missing != 0) {
            uint256 best = type(uint256).max;
            uint256 price = ceiling;
            for (uint256 i; i < asks.length; ++i) {
                if (remaining[i] != 0 && asks[i].order.price <= price) {
                    price = asks[i].order.price;
                    best = i;
                }
            }
            uint160 limit = _limit(night, price);
            uint256 poolQty = best == type(uint256).max ? missing : TENTH;
            (bool available, uint256 cost) = _quote(night, poolQty, limit);
            if (!available && poolQty > TENTH) {
                poolQty = TENTH;
                (available, cost) = _quote(night, poolQty, limit);
            }
            if (available) {
                if (cost > maxPaid - paid) revert Slippage();
                paid += _swapFunded(night, poolQty, false, limit, false, cost);
                missing -= poolQty;
            } else if (best != type(uint256).max) {
                Ask memory ask = asks[best];
                ask.qty = remaining[best] < missing ? remaining[best] : missing;
                cost = OrderLib.fillCost(ask.qty, ask.order.price);
                cost += FeeMath.halfUp(cost, 130, 10000);
                if (cost > maxPaid - paid) revert Slippage();
                paid += _fillAsk(ask);
                remaining[best] -= ask.qty;
                missing -= ask.qty;
            } else {
                break;
            }
            if (paid > maxPaid) revert Slippage();
        }
    }

    function _fillAsk(Ask memory ask) internal virtual returns (uint256);
}

contract TradeRouter is RouterCore, ITradeRouter {
    using SafeTransferLib for address;

    address public immutable bookingRouter;
    IRebatePool public immutable rebatePool;
    mapping(address => uint256) public nonces;
    mapping(bytes32 => uint256) public filled;

    constructor(address factory_, Deployment memory d) RouterCore(factory_, d, false) {
        if (d.bookingRouter == address(0) || d.rebatePool == address(0)) revert InvalidConfig();
        bookingRouter = d.bookingRouter;
        rebatePool = IRebatePool(d.rebatePool);
    }

    function msgSender() external view returns (address) {
        return activeUser;
    }

    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return OrderLib.domainSeparator(block.chainid, address(this));
    }

    function cancelAll() external returns (uint256 newNonce) {
        if (activeUser != address(0)) revert Reentrancy();
        newNonce = ++nonces[msg.sender];
        emit OrderCancelledAll(msg.sender, newNonce);
    }

    function buy(
        bytes32 night,
        uint256 qty,
        uint256 maxPaid,
        Ask[] calldata asks,
        Hint[] calldata hints,
        uint64 deadline
    ) external execution returns (uint256 paid) {
        _check(night, qty, deadline);
        if (!registry.isOrb(msg.sender)) revert Unauthorized();
        INightToken token = INightToken(factory.tokenOf(night));
        token.setHints(hints);
        uint256 missing;
        (paid, missing) = _route(night, qty, maxPaid, asks, type(uint256).max);
        if (missing != 0) revert SoldOut();
        address(token).safeTransfer(msg.sender, qty);
    }

    function sell(bytes32 night, uint256 qty, uint256 minReceived, Hint[] calldata hints, uint64 deadline)
        external
        execution
        returns (uint256 received)
    {
        _check(night, qty, deadline);
        if (!registry.isOrb(msg.sender)) revert Unauthorized();
        address token = factory.tokenOf(night);
        INightToken(token).setHints(hints);
        token.safeTransferFrom(msg.sender, address(this), qty);
        received = _swap(night, qty, true, TickMath.MIN_SQRT_PRICE + 1, false);
        if (received < minReceived) revert Slippage();
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        return _callback(data);
    }

    function fillBookingAsk(Ask calldata ask, address taker) external returns (uint256 gross, uint256 fee) {
        if (msg.sender != bookingRouter || taker == address(0) || IRouterSender(bookingRouter).msgSender() != taker) {
            revert Unauthorized();
        }
        if (activeUser != address(0)) revert Reentrancy();
        activeUser = taker;
        _check(ask.order.night, ask.qty, type(uint64).max);
        if (!registry.isVerified(taker)) revert Unauthorized();
        (gross, fee) = _executeAsk(ask, bookingRouter, true);
        activeUser = address(0);
    }

    function _fillAsk(Ask memory ask) internal override returns (uint256 gross) {
        uint256 fee;
        (gross, fee) = _executeAsk(ask, address(this), false);
        gross += fee;
    }

    function _executeAsk(Ask memory ask, address recipient, bool prefunded)
        private
        returns (uint256 gross, uint256 fee)
    {
        Order memory order = ask.order;
        if (order.size == 0 || order.size % TENTH != 0 || ask.qty == 0 || ask.qty % TENTH != 0) {
            revert InvalidQuantity();
        }
        if (order.price == 0 || order.maker == address(0)) revert InvalidConfig();
        if (block.timestamp > order.expiry) revert Expired();
        if (order.nonce != nonces[order.maker]) revert InvalidNonce();
        bytes32 digest = OrderLib.digest(DOMAIN_SEPARATOR(), OrderLib.hash(order));
        if (!SignatureCheckerLib.isValidSignatureNow(order.maker, digest, ask.signature)) revert InvalidSignature();
        if (ask.qty > order.size || filled[digest] > order.size - ask.qty) revert Overfilled();
        INightToken token = INightToken(factory.tokenOf(order.night));
        if (token.balanceOf(order.maker) < ask.qty) revert InvalidQuantity();
        filled[digest] += ask.qty;
        gross = OrderLib.fillCost(ask.qty, order.price);
        fee = FeeMath.halfUp(gross, 130, 10000);
        if (!prefunded) _pull(address(this), gross + fee);
        token.routerTransfer(order.maker, recipient, ask.qty);
        usdc.safeTransfer(address(hook), fee);
        (uint256 actualFee, uint256 cover) = hook.distributeFee(order.night, activeUser, gross, false);
        if (actualFee != fee) revert InvalidConfig();
        usdc.safeTransfer(order.maker, gross);
        uint256 rebate = rebatePool.payMaker(order.night, order.maker, order.price, ask.qty);
        emit Trade(order.night, activeUser, order.maker, 0, ask.qty, gross, fee, rebate, cover);
    }
}
