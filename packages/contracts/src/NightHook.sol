// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {CreditLib} from "./libraries/CreditLib.sol";

import {INightHook} from "./interfaces/INightHook.sol";
import {INightFactory} from "./interfaces/INightFactory.sol";
import {INightVault} from "./interfaces/INightVault.sol";
import {INightToken} from "./interfaces/INightToken.sol";
import {ISettlement} from "./interfaces/ISettlement.sol";
import {IHumanRegistry} from "./interfaces/IHumanRegistry.sol";
import {NightPosition} from "./libraries/NightPosition.sol";
import {LadderMath} from "./libraries/LadderMath.sol";
import {FeeMath} from "./libraries/FeeMath.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, toBeforeSwapDelta} from "v4-core/src/types/BeforeSwapDelta.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {SqrtPriceMath} from "v4-core/src/libraries/SqrtPriceMath.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";

import {IRouterSender} from "./interfaces/IRouterSender.sol";

contract NightHook is INightHook {
    using PoolIdLibrary for PoolKey;
    using SafeTransferLib for address;
    IPoolManager public immutable manager;
    INightFactory public immutable factory;
    address public immutable usdc;
    address public immutable vault;
    address public immutable tradeRouter;
    address public immutable bookingRouter;
    address public immutable settlement;
    address public immutable platform;
    address public immutable coverFund;
    address public immutable rebatePool;
    IHumanRegistry public immutable registry;
    address public immutable owner;
    bool public paused;
    mapping(PoolId => bytes32) public nightOf;
    mapping(PoolId => bool) public initialized;
    mapping(bytes32 => uint256) public seededRooms;
    mapping(bytes32 => mapping(uint256 => bool)) public seeded;
    mapping(bytes32 => mapping(uint256 => bool)) public removed;
    bool private busy;
    bytes32 private swapHash;
    uint256 private specifiedGross;
    FeeMath.Split private specifiedFee;

    constructor(address factory_, Deployment memory d, address owner_) {
        if (
            factory_ == address(0) || owner_ == address(0) || d.poolManager == address(0) || d.usdc == address(0)
                || d.vault == address(0) || d.tradeRouter == address(0) || d.bookingRouter == address(0)
                || d.settlement == address(0) || d.registry == address(0) || d.platform == address(0)
                || d.coverFund == address(0) || d.rebatePool == address(0)
        ) revert InvalidConfig();
        factory = INightFactory(factory_);
        manager = IPoolManager(d.poolManager);
        usdc = d.usdc;
        vault = d.vault;
        tradeRouter = d.tradeRouter;
        bookingRouter = d.bookingRouter;
        settlement = d.settlement;
        platform = d.platform;
        coverFund = d.coverFund;
        rebatePool = d.rebatePool;
        registry = IHumanRegistry(d.registry);
        owner = owner_;
        Hooks.validateHookPermissions(this, getHookPermissions());
    }
    modifier onlyManager() {
        if (msg.sender != address(manager)) revert Unauthorized();
        _;
    }

    function setPaused(bool value) external {
        if (msg.sender != owner) revert Unauthorized();
        paused = value;
        emit PauseChanged(value);
    }

    function getHookPermissions() public pure returns (Hooks.Permissions memory p) {
        p.beforeInitialize = true;
        p.beforeAddLiquidity = true;
        p.beforeRemoveLiquidity = true;
        p.beforeSwap = true;
        p.afterSwap = true;
        p.beforeDonate = true;
        p.beforeSwapReturnDelta = true;
        p.afterSwapReturnDelta = true;
    }

    function beforeInitialize(address sender, PoolKey calldata key, uint160 price)
        external
        onlyManager
        returns (bytes4)
    {
        if (sender != address(factory)) revert Unauthorized();
        if (
            Currency.unwrap(key.currency1) != usdc || Currency.unwrap(key.currency0) >= usdc || key.fee != 0
                || key.tickSpacing != 1 || address(key.hooks) != address(this)
        ) revert InvalidConfig();
        bytes32 night = INightToken(Currency.unwrap(key.currency0)).night();
        NightConfig memory c = factory.config(night);
        if (
            factory.tokenOf(night) != Currency.unwrap(key.currency0)
                || keccak256(abi.encode(factory.poolKey(night))) != keccak256(abi.encode(key))
        ) revert InvalidConfig();
        if (price != TickMath.getSqrtPriceAtTick(LadderMath.boundaryTick(c.F, c.k, c.S, 0))) revert InvalidConfig();
        PoolId id = key.toId();
        if (initialized[id]) revert AlreadyOpened(night);
        initialized[id] = true;
        nightOf[id] = night;
        return this.beforeInitialize.selector;
    }

    function _night(PoolKey calldata key) private view returns (bytes32) {
        PoolId id = key.toId();
        if (!initialized[id]) revert InvalidConfig();
        return nightOf[id];
    }

    function _position(bytes32 night, ModifyLiquidityParams calldata p) private view returns (uint256 i, uint128 l) {
        NightConfig memory c = factory.config(night);
        i = uint256(p.salt);
        (int24 lower, int24 upper, uint128 liquidity,) = NightPosition.room(c.F, c.k, c.S, i);
        if (p.tickLower != lower || p.tickUpper != upper) revert InvalidConfig();
        return (i, liquidity);
    }

    function beforeAddLiquidity(address sender, PoolKey calldata key, ModifyLiquidityParams calldata p, bytes calldata)
        external
        onlyManager
        returns (bytes4)
    {
        if (sender != vault) revert Unauthorized();
        bytes32 night = _night(key);
        if (block.timestamp >= factory.config(night).cutoff) revert CutoffReached();
        (uint256 i, uint128 l) = _position(night, p);
        if (
            i != seededRooms[night] || seeded[night][i] || i < INightVault(vault).nextRoom(night)
                || INightVault(vault).ladderComplete(night) || p.liquidityDelta != int256(uint256(l))
        ) revert InvalidChunk();
        seeded[night][i] = true;
        seededRooms[night] = i + 1;
        return this.beforeAddLiquidity.selector;
    }

    function beforeRemoveLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata p,
        bytes calldata
    ) external onlyManager returns (bytes4) {
        if (sender != vault) revert Unauthorized();
        bytes32 night = _night(key);
        (uint256 i, uint128 l) = _position(night, p);
        if (!seeded[night][i] || removed[night][i] || p.liquidityDelta != -int256(uint256(l))) revert InvalidChunk();
        NightConfig memory c = factory.config(night);
        if (INightVault(vault).closing(night)) {
            if (block.timestamp < c.cutoff) revert BeforeCutoff();
        } else {
            if ((i + 1) * 1e18 > INightToken(factory.tokenOf(night)).burned()) revert INightVault.UnearnedPosition();
            (uint160 price,,,) = StateLibrary.getSlot0(manager, key.toId());
            uint160 upper = TickMath.getSqrtPriceAtTick(p.tickUpper);
            // S + D leaves a tiny token tail even after the last tenth of a room is burned.
            // Only that excluded rounding inventory may accompany an earned removal.
            if (price < upper && SqrtPriceMath.getAmount0Delta(price, upper, l, true) > 1e9) {
                revert INightVault.UnearnedPosition();
            }
        }
        removed[night][i] = true;
        return this.beforeRemoveLiquidity.selector;
    }

    function _context(address sender, bytes32 night, bytes calldata data) private view returns (address user) {
        if (sender != tradeRouter && sender != bookingRouter) revert Unauthorized();
        SwapContext memory c = abi.decode(data, (SwapContext));
        user = IRouterSender(sender).msgSender();
        if (user == address(0) || c.user != user || c.night != night || c.booking != (sender == bookingRouter)) {
            revert Unauthorized();
        }
        if (sender == bookingRouter ? !registry.isVerified(user) : !registry.isOrb(user)) revert Unauthorized();
    }

    function _split(bytes32 night, address user, uint256 gross, bool sell) private view returns (FeeMath.Split memory) {
        NightConfig memory c = factory.config(night);
        uint256 human = registry.humanIdOf(user);
        uint256 rate = sell ? FeeMath.lateFee(int256(uint256(c.cutoff)) - int256(block.timestamp)) : 0.013e18;
        return FeeMath.split(gross, rate, user == c.host || (human != 0 && human == registry.humanIdOf(c.host)));
    }

    mapping(address => uint256) public credits;

    function withdrawCredit(address recipient) external returns (uint256 amount) {
        if (busy) revert Reentrancy();
        busy = true;
        amount = CreditLib.withdraw(credits, usdc, recipient);
        busy = false;
    }

    function _pay(bytes32 night, FeeMath.Split memory s) private {
        if (s.host != 0) CreditLib.pay(credits, usdc, factory.config(night).host, s.host);
        if (s.platform != 0) CreditLib.pay(credits, usdc, platform, s.platform);
        if (s.cover != 0) CreditLib.pay(credits, usdc, coverFund, s.cover);
        if (s.rebate != 0) CreditLib.pay(credits, usdc, rebatePool, s.rebate);
    }

    function distributeFee(bytes32 night, address user, uint256 notional, bool)
        external
        returns (uint256 fee, uint256 cover)
    {
        if (busy) revert Reentrancy();
        if (msg.sender != tradeRouter && msg.sender != bookingRouter && msg.sender != factory.tokenOf(night)) {
            revert Unauthorized();
        }
        busy = true;
        // This entry point serves asks and recalls; both always use the base fee.
        // Only pool sells use the late rate in the swap callbacks.
        FeeMath.Split memory s = _split(night, user, notional, false);
        _pay(night, s);
        busy = false;
        return (s.total, s.cover);
    }

    function _specified(SwapParams calldata p) private pure returns (bool) {
        return p.zeroForOne == (p.amountSpecified > 0);
    }

    function beforeSwap(address sender, PoolKey calldata key, SwapParams calldata p, bytes calldata data)
        external
        onlyManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        if (busy) revert Reentrancy();
        bytes32 night = _night(key);
        busy = true;
        swapHash = keccak256(abi.encode(sender, key, p, data));
        if (sender == settlement) {
            if (
                block.timestamp < factory.config(night).cutoff || !ISettlement(settlement).settling(night)
                    || !p.zeroForOne || p.amountSpecified >= 0
            ) revert Unauthorized();
            return (this.beforeSwap.selector, BeforeSwapDelta.wrap(0), 0);
        }
        if (paused) revert Paused();
        if (block.timestamp >= factory.config(night).cutoff) revert CutoffReached();
        if (!INightVault(vault).ladderComplete(night)) revert LadderIncomplete();
        address user = _context(sender, night, data);
        if (p.amountSpecified == 0 || p.amountSpecified == type(int256).min) revert InvalidQuantity();
        if (_specified(p)) {
            uint256 amount = uint256(p.amountSpecified < 0 ? -p.amountSpecified : p.amountSpecified);
            uint256 rate = p.zeroForOne
                ? FeeMath.lateFee(int256(uint256(factory.config(night).cutoff)) - int256(block.timestamp))
                : 0.013e18;
            uint256 gross = FullMath.mulDiv(amount, 1e18, p.zeroForOne ? 1e18 - rate : 1e18 + rate);
            FeeMath.Split memory s = _split(night, user, gross, p.zeroForOne);
            // Invert the rounded fee so specified USDC includes the fee exactly.
            uint256 net = p.zeroForOne ? gross - s.total : gross + s.total;
            if (net < amount) ++gross;
            s = _split(night, user, gross, p.zeroForOne);
            if ((p.zeroForOne ? gross - s.total : gross + s.total) != amount) revert InvalidQuantity();
            if (s.total > uint256(uint128(type(int128).max))) revert InvalidQuantity();
            specifiedGross = gross;
            specifiedFee = s;
            manager.take(key.currency1, address(this), s.total);
            _pay(night, s);
            return (this.beforeSwap.selector, toBeforeSwapDelta(int128(uint128(s.total)), 0), 0);
        }
        return (this.beforeSwap.selector, BeforeSwapDelta.wrap(0), 0);
    }

    function afterSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata p,
        BalanceDelta delta,
        bytes calldata data
    ) external onlyManager returns (bytes4, int128 feeDelta) {
        if (!busy || swapHash != keccak256(abi.encode(sender, key, p, data))) revert Unauthorized();
        bytes32 night = _night(key);
        if (sender != settlement) {
            address user = _context(sender, night, data);
            uint256 gross = uint256(delta.amount1() < 0 ? -int256(delta.amount1()) : int256(delta.amount1()));
            FeeMath.Split memory s;
            if (_specified(p)) {
                if (gross != specifiedGross) revert Slippage();
                s = specifiedFee;
                delete specifiedFee;
                specifiedGross = 0;
            } else {
                s = _split(night, user, gross, p.zeroForOne);
                if (s.total > uint256(uint128(type(int128).max))) revert InvalidQuantity();
                feeDelta = int128(uint128(s.total));
                manager.take(key.currency1, address(this), s.total);
                _pay(night, s);
            }
            uint256 qty = uint256(delta.amount0() < 0 ? -int256(delta.amount0()) : int256(delta.amount0()));
            emit Trade(night, user, address(0), p.zeroForOne ? 1 : 0, qty, gross, s.total, 0, s.cover);
        }
        busy = false;
        swapHash = bytes32(0);
        return (this.afterSwap.selector, feeDelta);
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert DonationForbidden();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert UnsupportedCallback();
    }

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert UnsupportedCallback();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert UnsupportedCallback();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert UnsupportedCallback();
    }
}
