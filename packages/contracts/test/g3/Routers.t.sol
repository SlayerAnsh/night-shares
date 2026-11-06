// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {TradeRouter, RouterCore} from "../../src/TradeRouter.sol";
import {BookingRouter} from "../../src/BookingRouter.sol";
import {INightTypes} from "../../src/interfaces/INightTypes.sol";
import {ITradeRouter} from "../../src/interfaces/ITradeRouter.sol";
import {OrderLib} from "../../src/libraries/OrderLib.sol";
import {LadderMath} from "../../src/libraries/LadderMath.sol";
import {FeeMath} from "../../src/libraries/FeeMath.sol";
import {MockUSDC} from "../mocks/MockUSDC.sol";
import {PoolManager} from "v4-core/src/PoolManager.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {
    FactoryDouble,
    RegistryDouble,
    Permit2Double,
    HookDouble,
    TokenDouble,
    RebateDouble,
    Seeder
} from "../doubles/g3/Dependencies.sol";

contract RoutersTest is Test, INightTypes {
    TradeRouter trade;
    BookingRouter book;
    FactoryDouble factory;
    RegistryDouble registry;
    Permit2Double permit;
    HookDouble hook;
    TokenDouble token;
    MockUSDC cash;
    PoolManager manager;
    RebateDouble rebate;
    PoolKey key;
    NightConfig c;
    bytes32 constant NIGHT = keccak256("night");
    uint256 constant MAKER_KEY = 1234;
    address maker;
    address buyer = address(0xB0B);
    address guest = address(0xCAFE);
    address host = address(0xA11CE);

    function setUp() public {
        vm.warp(1000000);
        maker = vm.addr(MAKER_KEY);
        manager = new PoolManager(address(this));
        factory = new FactoryDouble();
        registry = new RegistryDouble();
        permit = new Permit2Double();
        // Fixed addresses keep NightToken as currency0.
        deployCodeTo("test/doubles/g3/Dependencies.sol:TokenDouble", address(0x1000));
        token = TokenDouble(address(0x1000));
        deployCodeTo("test/mocks/MockUSDC.sol:MockUSDC", address(0x2000));
        cash = MockUSDC(address(0x2000));
        hook = new HookDouble(address(cash));
        rebate = new RebateDouble(IPoolManager(address(manager)), factory, address(cash));
        Deployment memory d;
        d.poolManager = address(manager);
        d.usdc = address(cash);
        d.permit2 = address(permit);
        d.registry = address(registry);
        d.hook = address(hook);
        d.rebatePool = address(rebate);
        d.bookingRouter = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        trade = new TradeRouter(address(factory), d);
        d.tradeRouter = address(trade);
        book = new BookingRouter(address(factory), d);
        assertEq(address(book), d.bookingRouter);
        token.wire(address(trade), address(book), address(cash), 20000e6);
        c = NightConfig(
            6000e6,
            1.2e18,
            15e18,
            20000e6,
            uint64(block.timestamp + 4 days),
            host,
            keccak256("property"),
            keccak256("room"),
            NIGHT,
            uint64(block.timestamp + 5 days)
        );
        key = PoolKey(Currency.wrap(address(token)), Currency.wrap(address(cash)), 0, 1, IHooks(address(0)));
        factory.configure(c, key);
        int24 lower = LadderMath.boundaryTick(c.F, c.k, c.S, 0);
        int24 upper = LadderMath.boundaryTick(c.F, c.k, c.S, c.S);
        manager.initialize(key, TickMath.getSqrtPriceAtTick(lower));
        Seeder seeder = new Seeder(IPoolManager(address(manager)));
        token.mint(address(seeder), 16e18);
        seeder.seed(
            key,
            lower,
            upper,
            LadderMath.liquidity(TickMath.getSqrtPriceAtTick(lower), TickMath.getSqrtPriceAtTick(upper), 15e18)
        );
        registry.set(buyer, 1, true);
        registry.set(guest, 2, false);
        registry.set(host, 3, true);
        registry.set(maker, 4, true);
        _fund(buyer);
        _fund(guest);
        _fund(host);
        token.mint(maker, 10e18);
        token.setRecallHolder(maker);
    }

    function _fund(address user) internal {
        cash.mint(user, 1e15);
        vm.startPrank(user);
        cash.approve(address(permit), type(uint256).max);
        permit.approve(address(cash), address(trade), type(uint160).max, type(uint48).max);
        permit.approve(address(cash), address(book), type(uint160).max, type(uint48).max);
        vm.stopPrank();
    }

    function _ask(uint256 size, uint256 price) internal view returns (Ask memory a) {
        a.order = Order(NIGHT, size, price, uint64(block.timestamp + 1 days), trade.nonces(maker), maker);
        a.qty = size;
        a.signature = _sign(a.order, trade.DOMAIN_SEPARATOR());
    }

    function _sign(Order memory order, bytes32 domain) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(MAKER_KEY, OrderLib.digest(domain, OrderLib.hash(order)));
        return abi.encodePacked(r, s, v);
    }

    function _one(Ask memory a) internal pure returns (Ask[] memory asks) {
        asks = new Ask[](1);
        asks[0] = a;
    }

    function _buy(Ask memory a) internal returns (uint256) {
        vm.prank(buyer);
        return trade.buy(NIGHT, a.qty, type(uint256).max, _one(a), new Hint[](0), type(uint64).max);
    }

    function _poolBuy(uint256 qty) internal returns (uint256) {
        vm.prank(buyer);
        return trade.buy(NIGHT, qty, type(uint256).max, new Ask[](0), new Hint[](0), type(uint64).max);
    }

    function testAskPaysSellerGrossAndTracksDigest() public {
        Ask memory a = _ask(1e18, 1000e6);
        vm.expectEmit(true, true, true, true, address(trade));
        emit Trade(NIGHT, buyer, maker, 0, 1e18, 1000e6, 13e6, 0, 1e6);
        uint256 paid = _buy(a);
        assertEq(paid, 1013e6);
        assertEq(cash.balanceOf(maker), 1000e6);
        assertEq(cash.balanceOf(address(hook)), 13e6);
        assertEq(token.balanceOf(buyer), 1e18);
        assertEq(trade.filled(OrderLib.digest(trade.DOMAIN_SEPARATOR(), OrderLib.hash(a.order))), 1e18);
        assertEq(trade.msgSender(), address(0));
        assertEq(cash.balanceOf(address(trade)), 0);
    }

    function testPartialThenOverfill() public {
        Ask memory a = _ask(1e18, 1000e6);
        a.qty = 6e17;
        _buy(a);
        vm.expectRevert(ITradeRouter.Overfilled.selector);
        _buy(a);
        a.qty = 4e17;
        _buy(a);
        assertEq(token.balanceOf(buyer), 1e18);
    }

    function testWrongDomain() public {
        Ask memory a = _ask(1e18, 1000e6);
        a.signature = _sign(a.order, OrderLib.domainSeparator(block.chainid, address(book)));
        vm.expectRevert(InvalidSignature.selector);
        _buy(a);
    }

    function testWrongChainAndTampering() public {
        Ask memory a = _ask(1e18, 1000e6);
        a.signature = _sign(a.order, OrderLib.domainSeparator(block.chainid + 1, address(trade)));
        vm.expectRevert(InvalidSignature.selector);
        _buy(a);
        a = _ask(1e18, 1000e6);
        a.order.price++;
        vm.expectRevert(InvalidSignature.selector);
        _buy(a);
    }

    function testExpiredOrder() public {
        Ask memory a = _ask(1e18, 1000e6);
        vm.warp(block.timestamp + 1 days + 1);
        vm.expectRevert(Expired.selector);
        _buy(a);
    }

    function testCancelSharedWithBooking() public {
        Ask memory a = _ask(1e18, 1000e6);
        vm.prank(maker);
        assertEq(trade.cancelAll(), 1);
        vm.expectRevert(ITradeRouter.InvalidNonce.selector);
        _buy(a);
        vm.prank(guest);
        vm.expectRevert(ITradeRouter.InvalidNonce.selector);
        book.buyAndRedeem(NIGHT, 1013e6, _one(a), new Hint[](0), type(uint64).max);
    }

    function testMakerMovedTokens() public {
        Ask memory a = _ask(1e18, 1000e6);
        vm.prank(maker);
        token.transfer(address(99), 10e18);
        vm.expectRevert(InvalidQuantity.selector);
        _buy(a);
    }

    function testAskCheapestFirstUnsorted() public {
        Ask[] memory asks = new Ask[](2);
        asks[0] = _ask(1e18, 2000e6);
        asks[1] = _ask(1e18, 1000e6);
        vm.prank(buyer);
        uint256 paid = trade.buy(NIGHT, 1e18, 1013e6, asks, new Hint[](0), type(uint64).max);
        assertEq(paid, 1013e6);
        assertEq(trade.filled(OrderLib.digest(trade.DOMAIN_SEPARATOR(), OrderLib.hash(asks[0].order))), 0);
    }

    function testPoolBuySellRealManagerAndNoResidualCustody() public {
        uint256 paid = _poolBuy(1e18);
        assertGt(paid, 6000e6);
        assertEq(token.balanceOf(buyer), 1e18);
        vm.startPrank(buyer);
        token.approve(address(trade), 1e18);
        uint256 received = trade.sell(NIGHT, 1e18, 0, new Hint[](0), type(uint64).max);
        vm.stopPrank();
        assertApproxEqAbs(received, paid, 20);
        assertEq(token.balanceOf(buyer), 0);
        assertEq(token.balanceOf(address(trade)), 0);
        assertEq(cash.balanceOf(address(trade)), 0);
    }

    function testPoolAndAskInterleaving() public {
        Ask memory a = _ask(1e18, 6200e6);
        vm.prank(buyer);
        trade.buy(NIGHT, 2e18, type(uint256).max, _one(a), new Hint[](0), type(uint64).max);
        assertEq(trade.filled(OrderLib.digest(trade.DOMAIN_SEPARATOR(), OrderLib.hash(a.order))), 1e18);
        assertEq(token.balanceOf(buyer), 2e18);
        assertGt(cash.balanceOf(address(manager)), 6000e6);
    }

    function testPoolSlippageRollsBack() public {
        vm.prank(buyer);
        vm.expectRevert(Slippage.selector);
        trade.buy(NIGHT, 1e18, 1, new Ask[](0), new Hint[](0), type(uint64).max);
        assertEq(token.balanceOf(buyer), 0);
        _poolBuy(1e18);
        vm.startPrank(buyer);
        token.approve(address(trade), 1e18);
        vm.expectRevert(Slippage.selector);
        trade.sell(NIGHT, 1e18, type(uint256).max, new Hint[](0), type(uint64).max);
        vm.stopPrank();
        assertEq(token.balanceOf(buyer), 1e18);
    }

    function testSoldOutExactPoolFill() public {
        vm.prank(buyer);
        vm.expectRevert(SoldOut.selector);
        trade.buy(NIGHT, 16e18, type(uint256).max, new Ask[](0), new Hint[](0), type(uint64).max);
        assertEq(token.balanceOf(buyer), 0);
    }

    function testBookingAskSharesFillStateAndBurns() public {
        Ask memory a = _ask(2e18, 1000e6);
        a.qty = 1e18;
        _buy(a);
        vm.prank(guest);
        (bytes32 id, uint256 paid) = book.buyAndRedeem(NIGHT, 1013e6, _one(a), new Hint[](0), type(uint64).max);
        Booking memory b = book.booking(id);
        assertEq(b.guest, guest);
        assertEq(b.night, NIGHT);
        assertEq(b.paid, paid);
        assertEq(b.qty, 1e18);
        assertEq(b.checkIn, c.checkIn);
        assertEq(token.burned(), 1e18);
        assertEq(token.balanceOf(address(book)), 0);
        assertEq(book.msgSender(), address(0));
        assertEq(book.tradeRouter(), address(trade));
        vm.expectRevert(ITradeRouter.Overfilled.selector);
        _buy(a);
    }

    function testBookingPoolSimpleOverload() public {
        vm.prank(guest);
        (bytes32 id, uint256 paid) = book.buyAndRedeem(NIGHT, 10000e6);
        assertGt(paid, 6000e6);
        assertEq(book.booking(id).paid, paid);
        assertEq(cash.balanceOf(address(manager)), paid);
        assertEq(token.burned(), 1e18);
    }

    function testBookingRecallsOnlyAtStrikeAndBurns() public {
        c.X = 5000e6;
        factory.configure(c, key);
        token.wire(address(trade), address(book), address(cash), c.X);
        vm.prank(guest);
        (, uint256 paid) = book.buyAndRedeem(NIGHT, c.X);
        assertEq(paid, c.X);
        assertEq(token.recalled(), 1e18);
        assertEq(token.burned(), 1e18);
        assertEq(cash.balanceOf(maker), 4935e6);
    }

    function testBookingRejectsAboveStrikeAskAndMaxPrice() public {
        c.X = 5000e6;
        factory.configure(c, key);
        token.wire(address(trade), address(book), address(cash), c.X);
        Ask memory a = _ask(1e18, 5500e6);
        vm.prank(guest);
        vm.expectRevert(Slippage.selector);
        book.buyAndRedeem(NIGHT, c.X - 1, _one(a), new Hint[](0), type(uint64).max);
        assertEq(token.burned(), 0);
        assertEq(book.bookingCount(), 0);
        vm.prank(guest);
        book.buyAndRedeem(NIGHT, c.X, _one(a), new Hint[](0), type(uint64).max);
        assertEq(trade.filled(OrderLib.digest(trade.DOMAIN_SEPARATOR(), OrderLib.hash(a.order))), 0);
    }

    function testBookingSoldOutRecall() public {
        c.X = 5000e6;
        factory.configure(c, key);
        token.wire(address(trade), address(book), address(cash), c.X);
        token.setRecallHolder(address(55));
        vm.prank(guest);
        vm.expectRevert(SoldOut.selector);
        book.buyAndRedeem(NIGHT, c.X);
        assertEq(book.bookingCount(), 0);
    }

    function testVoidHostHumanOnlyAndNoRecall() public {
        vm.prank(guest);
        vm.expectRevert(Unauthorized.selector);
        book.buyAndVoid(NIGHT, 1e18, type(uint256).max, new Ask[](0), type(uint64).max);
        registry.set(guest, 3, false);
        vm.prank(guest);
        uint256 paid = book.buyAndVoid(NIGHT, 1e18, type(uint256).max, new Ask[](0), type(uint64).max);
        assertGt(paid, 6000e6);
        assertEq(token.burned(), 1e18);
        assertEq(token.recalled(), 0);
        assertEq(book.bookingCount(), 0);
    }

    function testAccessVerificationAndDeadline() public {
        vm.prank(guest);
        vm.expectRevert(Unauthorized.selector);
        trade.buy(NIGHT, 1e18, 1e15, new Ask[](0), new Hint[](0), type(uint64).max);
        vm.prank(guest);
        vm.expectRevert(Unauthorized.selector);
        trade.sell(NIGHT, 1e18, 0, new Hint[](0), type(uint64).max);
        vm.prank(address(99));
        vm.expectRevert(Unauthorized.selector);
        book.buyAndRedeem(NIGHT, 1e15);
        vm.prank(buyer);
        vm.expectRevert(Expired.selector);
        trade.buy(NIGHT, 1e18, 1e15, new Ask[](0), new Hint[](0), uint64(block.timestamp - 1));
    }

    function testNightGates() public {
        factory.setComplete(false);
        vm.expectRevert(LadderIncomplete.selector);
        _poolBuy(1e18);
        vm.prank(guest);
        vm.expectRevert(LadderIncomplete.selector);
        book.buyAndRedeem(NIGHT, 1e15);
        factory.setComplete(true);
        hook.setPaused(true);
        vm.expectRevert(Paused.selector);
        _poolBuy(1e18);
        vm.prank(guest);
        vm.expectRevert(Paused.selector);
        book.buyAndRedeem(NIGHT, 1e15);
        hook.setPaused(false);
        vm.warp(c.cutoff);
        vm.expectRevert(CutoffReached.selector);
        _poolBuy(1e18);
        vm.prank(guest);
        vm.expectRevert(CutoffReached.selector);
        book.buyAndRedeem(NIGHT, 1e15);
    }

    function testCallbacksAndDelegatedFillRestricted() public {
        vm.expectRevert(Unauthorized.selector);
        trade.unlockCallback("");
        vm.expectRevert(Unauthorized.selector);
        book.unlockCallback("");
        vm.prank(address(manager));
        vm.expectRevert(Unauthorized.selector);
        trade.unlockCallback("");
        vm.prank(address(manager));
        vm.expectRevert(Unauthorized.selector);
        book.unlockCallback("");
        vm.expectRevert(Unauthorized.selector);
        trade.quotePool(NIGHT, 1e17, TickMath.MAX_SQRT_PRICE - 1);
        Ask memory a = _ask(1e18, 1000e6);
        vm.expectRevert(Unauthorized.selector);
        trade.fillBookingAsk(a, guest);
        vm.prank(address(book));
        vm.expectRevert(Unauthorized.selector);
        trade.fillBookingAsk(a, guest);
    }

    function testPermit2AllowanceRequiredAndRollback() public {
        vm.prank(buyer);
        permit.approve(address(cash), address(trade), 0, type(uint48).max);
        Ask memory a = _ask(1e18, 1000e6);
        vm.expectRevert("Permit2 allowance");
        _buy(a);
        assertEq(trade.filled(OrderLib.digest(trade.DOMAIN_SEPARATOR(), OrderLib.hash(a.order))), 0);
        assertEq(token.balanceOf(maker), 10e18);
    }

    function testReentrancyBlockedDuringMakerFee() public {
        hook.setReenter(address(trade));
        _buy(_ask(1e18, 1000e6));
        assertTrue(hook.attempted());
        assertTrue(hook.blocked());
    }

    function testMakerRebateCurrentPoolPriceAndBalanceLimit() public {
        cash.mint(address(rebate), 3e6);
        _buy(_ask(1e18, 1000e6));
        assertEq(cash.balanceOf(maker), 1003e6);
        assertEq(cash.balanceOf(address(rebate)), 0);
    }

    function testInvalidQuantitiesAndNight() public {
        vm.expectRevert(InvalidQuantity.selector);
        _poolBuy(1);
        Ask memory a = _ask(1e18, 1000e6);
        a.order.size = 1e18 + 1;
        vm.expectRevert(InvalidQuantity.selector);
        _buy(a);
        a = _ask(1e18, 1000e6);
        a.order.night = bytes32(uint256(1));
        vm.expectRevert(InvalidConfig.selector);
        _buy(a);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(UnknownNight.selector, bytes32(0)));
        trade.buy(bytes32(0), 1e18, 1e15, new Ask[](0), new Hint[](0), type(uint64).max);
    }

    function testFuzzAskCeilAndBuyerFee(uint64 price, uint8 tenths) public {
        price = uint64(bound(price, 1e6, 5000e6));
        tenths = uint8(bound(tenths, 1, 10));
        uint256 qty = uint256(tenths) * 1e17;
        uint256 paid = _buy(_ask(qty, price));
        uint256 gross = OrderLib.fillCost(qty, price);
        assertEq(paid, gross + FeeMath.halfUp(gross, 130, 10000));
        assertEq(cash.balanceOf(maker), gross);
    }

    function testSellNeedsOrdinaryTokenAllowance() public {
        _poolBuy(1e18);
        vm.prank(buyer);
        vm.expectRevert();
        trade.sell(NIGHT, 1e18, 0, new Hint[](0), type(uint64).max);
        assertEq(token.balanceOf(buyer), 1e18);
    }

    function testBookingDeadlineAndVoidSlippageRollback() public {
        vm.prank(guest);
        vm.expectRevert(Expired.selector);
        book.buyAndRedeem(NIGHT, 1e15, new Ask[](0), new Hint[](0), uint64(block.timestamp - 1));
        vm.prank(host);
        vm.expectRevert(Slippage.selector);
        book.buyAndVoid(NIGHT, 1e18, 0, new Ask[](0), type(uint64).max);
        assertEq(token.burned(), 0);
        vm.prank(host);
        vm.expectRevert(SoldOut.selector);
        book.buyAndVoid(NIGHT, 16e18, 1e15, new Ask[](0), type(uint64).max);
        assertEq(token.recalled(), 0);
    }

    function testBookingBurnedInventorySoldOut() public {
        c.S = 1e18;
        factory.configure(c, key);
        vm.prank(guest);
        book.buyAndRedeem(NIGHT, 1e15);
        vm.prank(guest);
        vm.expectRevert(SoldOut.selector);
        book.buyAndRedeem(NIGHT, 1e15);
        vm.prank(host);
        vm.expectRevert(SoldOut.selector);
        book.buyAndVoid(NIGHT, 1e17, 1e15, new Ask[](0), type(uint64).max);
    }

    function testAskSlippageAndMalformedInputs() public {
        Ask memory a = _ask(1e18, 1000e6);
        vm.prank(buyer);
        vm.expectRevert(Slippage.selector);
        trade.buy(NIGHT, a.qty, 1000e6 - 1, _one(a), new Hint[](0), type(uint64).max);
        assertEq(token.balanceOf(maker), 10e18);
        a.order.price = 0;
        vm.expectRevert(InvalidConfig.selector);
        _buy(a);
        a = _ask(1e18, 1000e6);
        a.qty = 0;
        vm.prank(buyer);
        vm.expectRevert(InvalidQuantity.selector);
        trade.buy(NIGHT, 1e18, 1e15, _one(a), new Hint[](0), type(uint64).max);
        a.qty = 2e18;
        vm.expectRevert(ITradeRouter.Overfilled.selector);
        _buy(a);
    }

    function testPermit2ExpiredAndBookingAllowance() public {
        vm.prank(buyer);
        permit.approve(address(cash), address(trade), type(uint160).max, uint48(block.timestamp - 1));
        vm.expectRevert("Permit2 expired");
        _poolBuy(1e18);
        vm.prank(guest);
        permit.approve(address(cash), address(book), 0, type(uint48).max);
        Ask memory a = _ask(1e18, 1000e6);
        vm.prank(guest);
        vm.expectRevert("Permit2 allowance");
        book.buyAndRedeem(NIGHT, 1e15, _one(a), new Hint[](0), type(uint64).max);
        assertEq(book.bookingCount(), 0);
    }

    function testChainIdChangesDomain() public {
        bytes32 oldDomain = trade.DOMAIN_SEPARATOR();
        Ask memory a = _ask(1e18, 1000e6);
        vm.chainId(block.chainid + 1);
        assertTrue(oldDomain != trade.DOMAIN_SEPARATOR());
        vm.expectRevert(InvalidSignature.selector);
        _buy(a);
    }

    function testDelegatedAskChecksTakerAndNightGates() public {
        Ask memory a = _ask(1e18, 1000e6);
        vm.mockCall(address(book), abi.encodeWithSignature("msgSender()"), abi.encode(guest));
        vm.prank(address(book));
        vm.expectRevert(Unauthorized.selector);
        trade.fillBookingAsk(a, buyer);
        factory.setComplete(false);
        vm.prank(address(book));
        vm.expectRevert(LadderIncomplete.selector);
        trade.fillBookingAsk(a, guest);
        factory.setComplete(true);
        hook.setPaused(true);
        vm.prank(address(book));
        vm.expectRevert(Paused.selector);
        trade.fillBookingAsk(a, guest);
        hook.setPaused(false);
        vm.warp(c.cutoff);
        vm.prank(address(book));
        vm.expectRevert(CutoffReached.selector);
        trade.fillBookingAsk(a, guest);
    }

    function testConstructorsRejectMissingWiring() public {
        Deployment memory d;
        vm.expectRevert(InvalidConfig.selector);
        new TradeRouter(address(factory), d);
        vm.expectRevert(InvalidConfig.selector);
        new BookingRouter(address(factory), d);
        d.poolManager = address(manager);
        d.usdc = address(cash);
        d.permit2 = address(permit);
        d.registry = address(registry);
        d.hook = address(hook);
        vm.expectRevert(InvalidConfig.selector);
        new TradeRouter(address(factory), d);
        vm.expectRevert(InvalidConfig.selector);
        new BookingRouter(address(factory), d);
    }

    function testUnexpectedPoolFailureCannotTriggerRecall() public {
        vm.mockCallRevert(
            address(manager),
            abi.encodeWithSelector(IPoolManager.swap.selector),
            abi.encodeWithSelector(Unauthorized.selector)
        );
        vm.prank(guest);
        vm.expectRevert(Unauthorized.selector);
        book.buyAndRedeem(NIGHT, 1e15);
        assertEq(token.recalled(), 0);
        assertEq(book.bookingCount(), 0);
    }

    function testBookingEventAndUniqueIds() public {
        c.X = 5000e6;
        factory.configure(c, key);
        token.wire(address(trade), address(book), address(cash), c.X);
        bytes32 expected = keccak256(abi.encode(block.chainid, address(book), uint256(1)));
        vm.expectEmit(true, true, false, true, address(book));
        emit Booked(NIGHT, guest, expected, 1e18, c.X);
        vm.prank(guest);
        (bytes32 first,) = book.buyAndRedeem(NIGHT, c.X);
        vm.prank(guest);
        (bytes32 second,) = book.buyAndRedeem(NIGHT, c.X);
        assertEq(first, expected);
        assertTrue(first != second);
        assertEq(book.bookingCount(), 2);
    }
}
