// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Vm} from "forge-std/Vm.sol";
import {Test} from "forge-std/Test.sol";
import {NightHook} from "../../src/NightHook.sol";
import {NightVault, NightPosition} from "../../src/NightVault.sol";
import {INightTypes} from "../../src/interfaces/INightTypes.sol";
import {INightHook} from "../../src/interfaces/INightHook.sol";
import {INightVault} from "../../src/interfaces/INightVault.sol";
import {LadderMath} from "../../src/libraries/LadderMath.sol";
import {FeeMath} from "../../src/libraries/FeeMath.sol";
import {MockUSDC} from "../mocks/MockUSDC.sol";
import {TokenDouble, RegistryDouble, FactoryDouble, RouterDouble, SettlementDouble} from "../doubles/g2/Endpoints.sol";
import {PoolManager} from "v4-core/src/PoolManager.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {SwapParams, ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta} from "v4-core/src/types/BeforeSwapDelta.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {SwapMath} from "v4-core/src/libraries/SwapMath.sol";
import {SqrtPriceMath} from "v4-core/src/libraries/SqrtPriceMath.sol";

contract NightMarketTest is Test, INightTypes {
    using PoolIdLibrary for PoolKey;
    bytes32 constant NIGHT = keccak256("hotel:room:2026-12-01");
    bytes32 constant PROPERTY = keccak256("hotel");
    address constant HOST = address(0xB01);
    address constant PLATFORM = address(0xB02);
    address constant COVER = address(0xB03);
    address constant REBATE = address(0xB04);
    address constant USER = address(0xB05);
    IPoolManager manager;
    MockUSDC usdc;
    TokenDouble token;
    FactoryDouble factory;
    RegistryDouble registry;
    SettlementDouble settlement;
    RouterDouble router;
    RouterDouble booking;
    NightHook hook;
    NightVault vault;
    PoolKey key;
    NightConfig c;

    function setUp() public {
        vm.warp(1_800_000_000);
        manager = IPoolManager(address(new PoolManager(address(this))));
        // Explicit addresses preserve the required NightToken/USDC ordering.
        usdc = MockUSDC(address(0x3600000000000000000000000000000000000000));
        vm.etch(address(usdc), address(new MockUSDC()).code);
        token = TokenDouble(address(0x1000000000000000000000000000000000000000));
        vm.etch(address(token), address(new TokenDouble()).code);
        token.setup(NIGHT);
        factory = new FactoryDouble();
        registry = new RegistryDouble();
        router = new RouterDouble(manager, false);
        booking = new RouterDouble(manager, true);
        settlement = new SettlementDouble(manager, address(usdc), COVER);
        vault = new NightVault(address(factory), address(manager), address(usdc), address(settlement));
        settlement.setVault(address(vault));
        token.endpoints(address(vault), address(manager), address(settlement));
        Deployment memory d;
        d.poolManager = address(manager);
        d.usdc = address(usdc);
        d.vault = address(vault);
        d.tradeRouter = address(router);
        d.bookingRouter = address(booking);
        d.settlement = address(settlement);
        d.registry = address(registry);
        d.platform = PLATFORM;
        d.coverFund = COVER;
        d.rebatePool = REBATE;
        uint160 flags = Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG
            | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
            | Hooks.BEFORE_DONATE_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG;
        hook = NightHook(address(uint160(0x800000) | flags));
        deployCodeTo("NightHook.sol:NightHook", abi.encode(address(factory), d, address(this)), address(hook));
        key = PoolKey(Currency.wrap(address(token)), Currency.wrap(address(usdc)), 0, 1, IHooks(address(hook)));
        c = NightConfig(
            6000e6,
            1.2e18,
            15e18,
            0,
            uint64(block.timestamp + 10 days),
            HOST,
            PROPERTY,
            bytes32("room"),
            NIGHT,
            uint64(block.timestamp + 11 days)
        );
        factory.setup(c, key);
        registry.set(USER, 1, true);
        registry.set(HOST, 2, true);
        _approve(USER);
    }

    function _approve(address user) internal {
        usdc.mint(user, 100_000_000e6);
        vm.startPrank(user);
        usdc.approve(address(router), type(uint256).max);
        token.approve(address(router), type(uint256).max);
        usdc.approve(address(booking), type(uint256).max);
        token.approve(address(booking), type(uint256).max);
        usdc.approve(address(settlement), type(uint256).max);
        token.approve(address(settlement), type(uint256).max);
        vm.stopPrank();
    }

    function _open() internal {
        factory.initialize(manager, TickMath.getSqrtPriceAtTick(LadderMath.boundaryTick(c.F, c.k, c.S, 0)));
        token.mint(address(vault), vault.requiredInventory(c));
        factory.open(vault);
    }

    function _seed() internal {
        _open();
        factory.chunk(vault, 0, c.S / 1e18);
    }

    function _buy(uint256 qty) internal returns (uint256 paid, uint256 gross) {
        uint256 fees = _fees();
        vm.prank(USER);
        BalanceDelta d = router.swap(key, SwapParams(false, int256(qty), TickMath.MAX_SQRT_PRICE - 1), NIGHT);
        assertEq(int256(d.amount0()), int256(qty));
        paid = uint256(-int256(d.amount1()));
        gross = paid - (_fees() - fees);
    }

    function _sell(uint256 qty) internal returns (uint256 received, uint256 gross) {
        uint256 fees = _fees();
        vm.prank(USER);
        BalanceDelta d = router.swap(key, SwapParams(true, -int256(qty), TickMath.MIN_SQRT_PRICE + 1), NIGHT);
        assertEq(int256(d.amount0()), -int256(qty));
        received = uint256(int256(d.amount1()));
        gross = received + (_fees() - fees);
    }

    function _buyReverts() internal {
        vm.prank(USER);
        vm.expectRevert();
        router.swap(key, SwapParams(false, 1e17, TickMath.MAX_SQRT_PRICE - 1), NIGHT);
    }

    function _fees() internal view returns (uint256) {
        return usdc.balanceOf(HOST) + usdc.balanceOf(PLATFORM) + usdc.balanceOf(COVER) + usdc.balanceOf(REBATE);
    }

    function testFullSelloutInTenthsAndSellBack() public {
        _seed();
        uint256 paid;
        uint256 boughtGross;
        for (uint256 i; i < 150; ++i) {
            (uint256 p, uint256 g) = _buy(1e17);
            paid += p;
            boughtGross += g;
            assertEq(p - g, FeeMath.halfUp(g, 130, 10000));
        }
        assertEq(token.balanceOf(USER), 15e18);
        uint256 received;
        uint256 soldGross;
        for (uint256 i; i < 150; ++i) {
            (uint256 r, uint256 g) = _sell(1e17);
            received += r;
            soldGross += g;
            assertEq(g - r, FeeMath.halfUp(g, 130, 10000));
        }
        assertEq(token.balanceOf(USER), 0);
        // Each swap rounds USDC toward the pool; only sub-micro precision is lost per step.
        assertLe(boughtGross - soldGross, 315);
        assertEq(paid - received, _fees() + boughtGross - soldGross);
        emit log_named_uint("full sellout gross micro USDC", boughtGross);
    }

    function testChunksAndDust() public {
        _open();
        uint256 supply = token.totalSupply();
        assertGt(supply, c.S);
        assertLt(supply - c.S, 15e9);
        factory.chunk(vault, 0, 5);
        assertEq(vault.nextRoom(NIGHT), 5);
        assertFalse(vault.ladderComplete(NIGHT));
        _buyReverts();
        factory.chunk(vault, 5, 15);
        assertTrue(vault.ladderComplete(NIGHT));
        assertEq(vault.dust(NIGHT), 0);
        assertEq(token.balanceOf(address(manager)), supply);
        vm.expectRevert(InvalidChunk.selector);
        factory.chunk(vault, 0, 1);
    }

    function testVaultAccessAndInvalidChunks() public {
        vm.expectRevert(Unauthorized.selector);
        vault.openNight(NIGHT);
        vm.expectRevert(Unauthorized.selector);
        vault.addLadderChunk(NIGHT, 0, 1);
        vm.expectRevert(Unauthorized.selector);
        vault.releaseAtCutoff(NIGHT);
        vm.expectRevert(Unauthorized.selector);
        vault.payPending(PROPERTY, USER, 1);
        vm.expectRevert(Unauthorized.selector);
        vault.unlockCallback("");
        vm.prank(address(manager));
        vm.expectRevert(Unauthorized.selector);
        vault.unlockCallback("");
        vm.expectRevert(abi.encodeWithSelector(UnknownNight.selector, NIGHT));
        vault.sweep(NIGHT);
        _open();
        vm.expectRevert(abi.encodeWithSelector(AlreadyOpened.selector, NIGHT));
        factory.open(vault);
        vm.expectRevert(InvalidChunk.selector);
        factory.chunk(vault, 1, 2);
        vm.expectRevert(InvalidChunk.selector);
        factory.chunk(vault, 0, 0);
        vm.expectRevert(InvalidChunk.selector);
        factory.chunk(vault, 0, 16);
        vm.warp(c.cutoff);
        vm.expectRevert(CutoffReached.selector);
        factory.chunk(vault, 0, 1);
    }

    function testPauseIdentityContextAndTimestamp() public {
        _seed();
        vm.prank(USER);
        vm.expectRevert(Unauthorized.selector);
        hook.setPaused(true);
        hook.setPaused(true);
        assertTrue(hook.paused());
        _buyReverts();
        hook.setPaused(false);
        registry.set(USER, 1, false);
        _buyReverts();
        vm.prank(USER);
        booking.swap(key, SwapParams(false, 1e18, TickMath.MAX_SQRT_PRICE - 1), NIGHT);
        registry.set(USER, 0, false);
        vm.prank(USER);
        vm.expectRevert();
        booking.swap(key, SwapParams(false, 1e18, TickMath.MAX_SQRT_PRICE - 1), NIGHT);
        registry.set(USER, 1, true);
        vm.expectRevert();
        router.rawSwap(
            key, SwapParams(false, 1e17, TickMath.MAX_SQRT_PRICE - 1), abi.encode(SwapContext(NIGHT, HOST, false)), USER
        );
        vm.expectRevert();
        router.rawSwap(
            key, SwapParams(false, 1e17, TickMath.MAX_SQRT_PRICE - 1), abi.encode(SwapContext(NIGHT, USER, true)), USER
        );
        RouterDouble rogue = new RouterDouble(manager, false);
        vm.prank(USER);
        vm.expectRevert();
        rogue.swap(key, SwapParams(false, 1e17, TickMath.MAX_SQRT_PRICE - 1), NIGHT);
        vm.warp(c.cutoff);
        _buyReverts();
    }

    function testLateFeesAndHostAlternateWallet() public {
        _seed();
        _buy(3e18);
        vm.warp(c.cutoff - 36 hours);
        uint256 h = usdc.balanceOf(HOST);
        uint256 p = usdc.balanceOf(PLATFORM);
        uint256 cf = usdc.balanceOf(COVER);
        uint256 r = usdc.balanceOf(REBATE);
        (, uint256 gross) = _sell(1e18);
        FeeMath.Split memory s = FeeMath.split(gross, 0.1565e18, false);
        assertEq(usdc.balanceOf(HOST) - h, s.host);
        assertEq(usdc.balanceOf(PLATFORM) - p, s.platform);
        assertEq(usdc.balanceOf(COVER) - cf, s.cover);
        assertEq(usdc.balanceOf(REBATE) - r, s.rebate);
        registry.set(USER, 2, true);
        h = usdc.balanceOf(HOST);
        r = usdc.balanceOf(REBATE);
        (, gross) = _buy(1e18);
        assertEq(usdc.balanceOf(HOST), h);
        assertEq(usdc.balanceOf(REBATE) - r, FeeMath.halfUp(gross, 100, 10000));
    }

    function testSpecifiedUSDCFeeBranches() public {
        _seed();
        uint256 beforeFees = _fees();
        vm.prank(USER);
        BalanceDelta buy = router.swap(key, SwapParams(false, -int256(1013e6), TickMath.MAX_SQRT_PRICE - 1), NIGHT);
        assertEq(int256(buy.amount1()), -int256(1013e6));
        assertEq(_fees() - beforeFees, 13e6);
        beforeFees = _fees();
        vm.prank(USER);
        BalanceDelta sell = router.swap(key, SwapParams(true, int256(987e5), TickMath.MIN_SQRT_PRICE + 1), NIGHT);
        assertEq(int256(sell.amount1()), int256(987e5));
        assertEq(_fees() - beforeFees, 13e5);
    }

    function testPendingWaterfallAndDebt() public {
        _seed();
        usdc.mint(address(this), 100e6);
        usdc.approve(address(vault), 100e6);
        vm.expectRevert(InvalidConfig.selector);
        vault.creditPending(bytes32("unknown"), 1);
        vault.creditPending(PROPERTY, 100e6);
        assertEq(vault.pending(PROPERTY), 100e6);
        uint256 beforeUser = usdc.balanceOf(USER);
        assertEq(settlement.pay(PROPERTY, USER, 40e6), 40e6);
        assertEq(usdc.balanceOf(USER) - beforeUser, 40e6);
        settlement.debt(HOST, 25e6);
        (uint256 amount, uint256 netted) = vault.sweep(NIGHT);
        assertEq(amount, 0);
        assertEq(netted, 25e6);
        assertEq(usdc.balanceOf(COVER), 25e6);
        assertEq(usdc.balanceOf(HOST), 35e6);
        assertEq(vault.pending(PROPERTY), 0);
        assertEq(settlement.pay(PROPERTY, USER, 100e6), 0);
    }

    function testSweepOnlyBurnedPositionsAndIdempotence() public {
        _seed();
        _buy(3e18);
        (uint256 none,) = vault.sweep(NIGHT);
        assertEq(none, 0);
        vm.prank(USER);
        token.burn(2e18);
        uint256 host = usdc.balanceOf(HOST);
        settlement.debt(HOST, 1e6);
        hook.setPaused(true);
        (uint256 earned, uint256 netted) = vault.sweep(NIGHT);
        assertGt(earned, 12000e6);
        assertEq(netted, 1e6);
        assertEq(usdc.balanceOf(HOST) - host, earned - netted);
        assertTrue(vault.removed(NIGHT, 0));
        assertTrue(vault.removed(NIGHT, 1));
        assertFalse(vault.removed(NIGHT, 2));
        (none,) = vault.sweep(NIGHT);
        assertEq(none, 0);
    }

    function testCutoffRedemptionAndReleaseWhilePaused() public {
        _seed();
        _buy(7e18);
        vm.expectRevert(BeforeCutoff.selector);
        settlement.release(NIGHT);
        vm.warp(c.cutoff);
        hook.setPaused(true);
        uint256 feeBefore = _fees();
        vm.prank(USER);
        vm.expectRevert();
        settlement.swap(key, SwapParams(true, -int256(7e18), TickMath.MIN_SQRT_PRICE + 1), NIGHT);
        settlement.setSettling(NIGHT, true);
        vm.prank(USER);
        settlement.swap(key, SwapParams(true, -int256(7e18), TickMath.MIN_SQRT_PRICE + 1), NIGHT);
        assertEq(_fees(), feeBefore);
        (uint256 returnedUSDC, uint256 returnedTokens) = settlement.release(NIGHT);
        assertLt(returnedUSDC, 20);
        assertEq(
            returnedTokens + token.balanceOf(address(manager)) + token.balanceOf(address(vault)), token.totalSupply()
        );
        assertEq(returnedTokens, c.S);
        uint256 topUp = token.totalSupply() - c.S;
        assertEq(settlement.burnDust(token), topUp);
        assertEq(token.totalSupply(), c.S);
        assertEq(token.burned(), 0);
        assertLt(token.balanceOf(address(manager)), 15e9);
        assertEq(token.balanceOf(address(settlement)), returnedTokens);
        assertFalse(vault.closing(NIGHT));
        assertTrue(vault.closed(NIGHT));
        vm.expectRevert(CutoffReached.selector);
        settlement.release(NIGHT);
    }

    function testIncompleteOpeningCutoff() public {
        _open();
        factory.chunk(vault, 0, 4);
        uint256 inventory = token.totalSupply();
        vm.warp(c.cutoff);
        (, uint256 returned) = settlement.release(NIGHT);
        assertEq(returned, c.S);
        assertEq(returned + token.balanceOf(address(vault)) + token.balanceOf(address(manager)), inventory);
        assertGt(vault.dust(NIGHT), 0);
        assertEq(settlement.burnDust(token), inventory - c.S);
    }

    function testCallbacksRejectDirectCallsAndDisabledCallbacks() public {
        SwapParams memory p = SwapParams(false, 1e17, TickMath.MAX_SQRT_PRICE - 1);
        ModifyLiquidityParams memory l = ModifyLiquidityParams(0, 1, 1, 0);
        vm.expectRevert(Unauthorized.selector);
        hook.beforeInitialize(address(factory), key, 1);
        vm.expectRevert(Unauthorized.selector);
        hook.beforeAddLiquidity(address(vault), key, l, "");
        vm.expectRevert(Unauthorized.selector);
        hook.beforeRemoveLiquidity(address(vault), key, l, "");
        vm.expectRevert(Unauthorized.selector);
        hook.beforeSwap(address(router), key, p, "");
        vm.expectRevert(Unauthorized.selector);
        hook.afterSwap(address(router), key, p, BalanceDelta.wrap(0), "");
        vm.expectRevert(INightHook.DonationForbidden.selector);
        hook.beforeDonate(USER, key, 0, 0, "");
        vm.expectRevert(INightHook.UnsupportedCallback.selector);
        hook.afterDonate(USER, key, 0, 0, "");
        vm.expectRevert(INightHook.UnsupportedCallback.selector);
        hook.afterInitialize(USER, key, 1, 0);
        vm.expectRevert(INightHook.UnsupportedCallback.selector);
        hook.afterAddLiquidity(USER, key, l, BalanceDelta.wrap(0), BalanceDelta.wrap(0), "");
        vm.expectRevert(INightHook.UnsupportedCallback.selector);
        hook.afterRemoveLiquidity(USER, key, l, BalanceDelta.wrap(0), BalanceDelta.wrap(0), "");
        vm.prank(address(manager));
        vm.expectRevert(Unauthorized.selector);
        hook.afterSwap(address(router), key, p, BalanceDelta.wrap(0), "");
    }

    function testPrefundedFeeAuthorizationAndHalfUp() public {
        _seed();
        vm.expectRevert(Unauthorized.selector);
        hook.distributeFee(NIGHT, USER, 500, false);
        usdc.mint(address(hook), 7);
        vm.prank(address(router));
        (uint256 fee, uint256 cover) = hook.distributeFee(NIGHT, USER, 500, false);
        assertEq(fee, 7);
        assertEq(cover, 1);
        assertEq(usdc.balanceOf(HOST), 5);
        assertEq(usdc.balanceOf(PLATFORM), 1);
        usdc.mint(address(hook), 7);
        vm.prank(address(token));
        hook.distributeFee(NIGHT, HOST, 500, false);
        assertEq(usdc.balanceOf(REBATE), 5);
    }

    function testGasMax100OpeningAndCutoff() public {
        c.S = 100e18;
        factory.setup(c, key);
        uint256 start = gasleft();
        _open();
        emit log_named_uint("S100 initialize and inventory validation gas", start - gasleft());
        start = gasleft();
        factory.chunk(vault, 0, 100);
        emit log_named_uint("S100 one chunk gas", start - gasleft());
        vm.warp(c.cutoff);
        start = gasleft();
        settlement.release(NIGHT);
        emit log_named_uint("S100 vault cutoff removal gas", start - gasleft());
    }

    function _mathCost(uint256 from, uint256 to) internal pure returns (uint256 cost) {
        for (uint256 i = from; i < to; ++i) {
            (int24 a, int24 b, uint128 l) = LadderMath.room(6000e6, 1.2e18, 15e18, i);
            // USDC cost rounds up toward the pool, independently for every crossed room.
            cost += SqrtPriceMath.getAmount1Delta(
                TickMath.getSqrtPriceAtTick(a), TickMath.getSqrtPriceAtTick(b), l, true
            );
        }
    }

    function testParityTickLadderVersusPoolAndModelDiscrepancy() public {
        _seed();
        uint256 total;
        uint256 seventh;
        uint256 sixNine;
        uint256 twoFive;
        uint160 modelPrice = TickMath.getSqrtPriceAtTick(LadderMath.boundaryTick(c.F, c.k, c.S, 0));
        uint256 modelRoom;
        for (uint256 i; i < 15; ++i) {
            (, uint256 gross) = _buy(1e18);
            uint256 quoted;
            (modelPrice, modelRoom, quoted) = _quote(modelPrice, modelRoom, 1e18);
            // Every USDC swap step rounds up toward the pool. The executable tick-ladder
            // quote includes D and matches the pool within one micro per room crossed.
            assertApproxEqAbs(gross, quoted, 1);
            // The frozen room() liquidity floors below one room; our mandatory top-up
            // and v4 bitmap-word steps change its full-boundary quote by several micros.
            assertApproxEqAbs(gross, _mathCost(i, i + 1), 5);
            total += gross;
            if (i == 6) seventh = gross;
            if (i >= 6 && i < 9) sixNine += gross;
            if (i >= 2 && i < 5) twoFive += gross;
        }
        uint256 voidCost = sixNine + FeeMath.halfUp(sixNine, 130, 10000) - twoFive;
        uint256 seventhWithFee = seventh + FeeMath.halfUp(seventh, 130, 10000);
        assertApproxEqRel(seventh, 1009217e4, 0.0003e18);
        assertApproxEqRel(total, 17396238e4, 0.0003e18);
        assertApproxEqRel(voidCost, 942826e4, 0.0003e18);
        assertApproxEqRel(seventhWithFee, 1022336e4, 0.0003e18);
        // Model b71a8bbf697d figures use unquantized boundaries and cent rounding.
        // These assertions expose why one-micro-USDC model parity cannot hold with frozen LadderMath.
        assertGt(absDiff(seventh, 1009217e4), 1);
        assertGt(absDiff(total, 17396238e4), 15);
        emit log_named_uint("cost(6,7) micro USDC", seventh);
        emit log_named_uint("cost(0,15) micro USDC", total);
        emit log_named_uint("cost(6,9)*1.013-cost(2,5) micro USDC", voidCost);
        emit log_named_uint("cost(6,7)*1.013 micro USDC", seventhWithFee);
    }

    function _quote(uint160 price, uint256 roomIndex, uint256 qty)
        internal
        pure
        returns (uint160, uint256, uint256 cost)
    {
        while (qty != 0) {
            (, int24 upper, uint128 l,) = NightPosition.room(6000e6, 1.2e18, 15e18, roomIndex);
            // v4 also rounds at empty bitmap-word boundaries (256 ticks), even
            // inside one position. Include those steps in the executable quote.
            int24 tick = TickMath.getTickAtSqrtPrice(price);
            int24 wordEnd = ((tick + 1) >> 8) * 256 + 255;
            int24 nextTick = wordEnd < upper ? wordEnd : upper;
            uint160 target = TickMath.getSqrtPriceAtTick(nextTick);
            (uint160 next, uint256 amountIn, uint256 amountOut,) =
                SwapMath.computeSwapStep(price, target, l, int256(qty), 0);
            cost += amountIn;
            qty -= amountOut;
            price = next;
            if (price == TickMath.getSqrtPriceAtTick(upper)) ++roomIndex;
        }
        return (price, roomIndex, cost);
    }

    function testSweepImmediatelyAfterOneRoomBurn() public {
        _seed();
        _buy(1e18);
        vm.prank(USER);
        token.burn(1e18);
        (uint256 earned,) = vault.sweep(NIGHT);
        assertGt(earned, 6000e6);
        assertTrue(vault.removed(NIGHT, 0));
        assertGt(vault.dust(NIGHT), 0);
        assertLe(vault.dust(NIGHT), 1e9);
        _buy(1e18);
    }

    function testHookInitializeValidation() public {
        uint160 price = TickMath.getSqrtPriceAtTick(LadderMath.boundaryTick(c.F, c.k, c.S, 0));
        vm.prank(address(manager));
        vm.expectRevert(Unauthorized.selector);
        hook.beforeInitialize(USER, key, price);
        PoolKey memory bad = key;
        bad.fee = 100;
        vm.prank(address(manager));
        vm.expectRevert(InvalidConfig.selector);
        hook.beforeInitialize(address(factory), bad, price);
        bad = key;
        bad.tickSpacing = 2;
        vm.prank(address(manager));
        vm.expectRevert(InvalidConfig.selector);
        hook.beforeInitialize(address(factory), bad, price);
        bad = key;
        bad.currency1 = Currency.wrap(USER);
        vm.prank(address(manager));
        vm.expectRevert(InvalidConfig.selector);
        hook.beforeInitialize(address(factory), bad, price);
        bad = key;
        bad.currency0 = Currency.wrap(address(uint160(address(usdc)) + 1));
        vm.prank(address(manager));
        vm.expectRevert(InvalidConfig.selector);
        hook.beforeInitialize(address(factory), bad, price);
        bad = key;
        bad.hooks = IHooks(USER);
        vm.prank(address(manager));
        vm.expectRevert(InvalidConfig.selector);
        hook.beforeInitialize(address(factory), bad, price);
        vm.prank(address(manager));
        vm.expectRevert(InvalidConfig.selector);
        hook.beforeInitialize(address(factory), key, price + 1);
        _open();
        vm.prank(address(manager));
        vm.expectRevert(abi.encodeWithSelector(AlreadyOpened.selector, NIGHT));
        hook.beforeInitialize(address(factory), key, price);
    }

    function testLiquidityCallbackAuthorization() public {
        _open();
        (int24 a, int24 b, uint128 l,) = NightPosition.room(c.F, c.k, c.S, 0);
        ModifyLiquidityParams memory p = ModifyLiquidityParams(a, b, int256(uint256(l)), 0);
        vm.prank(address(manager));
        vm.expectRevert(Unauthorized.selector);
        hook.beforeAddLiquidity(USER, key, p, "");
        p.liquidityDelta++;
        vm.prank(address(manager));
        vm.expectRevert(InvalidChunk.selector);
        hook.beforeAddLiquidity(address(vault), key, p, "");
        p.liquidityDelta--;
        p.tickUpper++;
        vm.prank(address(manager));
        vm.expectRevert(InvalidConfig.selector);
        hook.beforeAddLiquidity(address(vault), key, p, "");
        p.tickUpper--;
        factory.chunk(vault, 0, 15);
        vm.prank(address(manager));
        vm.expectRevert(InvalidChunk.selector);
        hook.beforeAddLiquidity(address(vault), key, p, "");
        p.liquidityDelta = -int256(uint256(l));
        vm.prank(address(manager));
        vm.expectRevert(Unauthorized.selector);
        hook.beforeRemoveLiquidity(USER, key, p, "");
        vm.prank(address(manager));
        vm.expectRevert(INightVault.UnearnedPosition.selector);
        hook.beforeRemoveLiquidity(address(vault), key, p, "");
        p.liquidityDelta++;
        vm.prank(address(manager));
        vm.expectRevert(InvalidChunk.selector);
        hook.beforeRemoveLiquidity(address(vault), key, p, "");
        vm.warp(c.cutoff);
        vm.prank(address(manager));
        vm.expectRevert(CutoffReached.selector);
        hook.beforeAddLiquidity(address(vault), key, p, "");
    }

    function testOpenRejectsWrongInventoryAndInvalidCurve() public {
        vm.expectRevert(InvalidQuantity.selector);
        factory.open(vault);
        NightConfig memory bad = c;
        bad.S = 101e18;
        vm.expectRevert(LadderMath.InvalidCurve.selector);
        vault.requiredInventory(bad);
        bad = c;
        bad.k = 1;
        vm.expectRevert(LadderMath.InvalidRange.selector);
        vault.requiredInventory(bad);
        vm.warp(c.cutoff);
        vm.expectRevert(CutoffReached.selector);
        factory.open(vault);
    }

    function testSpecifiedPartialFillRevertsAndSettlingCannotBuy() public {
        _seed();
        uint160 limit = TickMath.getSqrtPriceAtTick(LadderMath.boundaryTick(c.F, c.k, c.S, 1e18));
        vm.prank(USER);
        vm.expectRevert();
        router.swap(key, SwapParams(false, -int256(100000e6), limit), NIGHT);
        vm.warp(c.cutoff);
        settlement.setSettling(NIGHT, true);
        vm.prank(USER);
        vm.expectRevert();
        settlement.swap(key, SwapParams(false, 1e18, TickMath.MAX_SQRT_PRICE - 1), NIGHT);
    }

    function testMax100EveryTenthSellout() public {
        c.S = 100e18;
        factory.setup(c, key);
        _seed();
        for (uint256 i; i < 1000; ++i) {
            _buy(1e17);
        }
        assertEq(token.balanceOf(USER), 100e18);
    }

    function testAskAndRecallFeesStayBaseNearCutoff() public {
        _seed();
        vm.warp(c.cutoff - 1);
        usdc.mint(address(hook), 13e6);
        vm.prank(address(token));
        (uint256 fee, uint256 cover) = hook.distributeFee(NIGHT, USER, 1000e6, true);
        assertEq(fee, 13e6);
        assertEq(cover, 1e6);
        assertEq(usdc.balanceOf(REBATE), 0);
    }

    function testTradeEventMatchesActualPoolLeg() public {
        _seed();
        vm.recordLogs();
        (uint256 paid, uint256 gross) = _buy(1e18);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 trades;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter != address(hook)) continue;
            assertEq(
                logs[i].topics[0],
                keccak256("Trade(bytes32,address,address,uint8,uint256,uint256,uint256,uint256,uint256)")
            );
            assertEq(logs[i].topics[1], NIGHT);
            assertEq(logs[i].topics[2], bytes32(uint256(uint160(USER))));
            assertEq(logs[i].topics[3], bytes32(0));
            (uint8 side, uint256 qty, uint256 notional, uint256 fee, uint256 rebate, uint256 cover) =
                abi.decode(logs[i].data, (uint8, uint256, uint256, uint256, uint256, uint256));
            assertEq(side, 0);
            assertEq(qty, 1e18);
            assertEq(notional, gross);
            assertEq(fee, paid - gross);
            assertEq(rebate, 0);
            assertEq(cover, FeeMath.halfUp(gross, 10, 10000));
            ++trades;
        }
        assertEq(trades, 1);
    }

    function testFundingFailureRollsBackPending() public {
        _seed();
        vm.mockCall(
            address(usdc),
            abi.encodeWithSelector(usdc.transferFrom.selector, address(this), address(vault), uint256(1e6)),
            abi.encode(false)
        );
        vm.expectRevert();
        vault.creditPending(PROPERTY, 1e6);
        assertEq(vault.pending(PROPERTY), 0);
        vm.clearMockedCalls();
    }

    function testChunk10Gas() public {
        c.S = 100e18;
        factory.setup(c, key);
        _open();
        uint256 start = gasleft();
        factory.chunk(vault, 0, 10);
        emit log_named_uint("S100 ten-room chunk gas", start - gasleft());
    }

    function absDiff(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a - b : b - a;
    }
}
