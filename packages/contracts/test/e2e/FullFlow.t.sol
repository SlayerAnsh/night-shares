// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {DeployLib} from "../../script/DeployLib.sol";
import {INightTypes} from "../../src/interfaces/INightTypes.sol";
import {INightToken} from "../../src/interfaces/INightToken.sol";
import {ITradeRouter} from "../../src/interfaces/ITradeRouter.sol";
import {ISettlement} from "../../src/interfaces/ISettlement.sol";
import {NightHook} from "../../src/NightHook.sol";
import {NightFactory} from "../../src/NightFactory.sol";
import {NightToken} from "../../src/NightToken.sol";
import {NightVault} from "../../src/NightVault.sol";
import {TradeRouter} from "../../src/TradeRouter.sol";
import {BookingRouter} from "../../src/BookingRouter.sol";
import {Settlement} from "../../src/Settlement.sol";
import {HumanRegistry} from "../../src/HumanRegistry.sol";
import {CoverFund} from "../../src/CoverFund.sol";
import {RebatePool} from "../../src/RebatePool.sol";
import {OrderLib} from "../../src/libraries/OrderLib.sol";
import {FeeMath} from "../../src/libraries/FeeMath.sol";
import {LadderMath} from "../../src/libraries/LadderMath.sol";
import {MockUSDC} from "../mocks/MockUSDC.sol";
import {PoolManager} from "v4-core/src/PoolManager.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

/// @notice Production peers, real PoolManager and captured canonical Permit2 runtime.
/// The only mock is the requested storage-backed Arc USDC replacement.
contract FullFlowTest is Test, INightTypes {
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    uint256 constant ATTESTER_KEY = 700;
    uint256 constant MAKER_KEY = 701;
    address constant HOST = address(0x800);
    address constant ALT = address(0x801);
    address constant BUYER = address(0x802);
    address constant GUEST = address(0x803);
    address constant PLATFORM = address(0x804);
    MockUSDC cash = MockUSDC(USDC);
    NightFactory factory;
    NightVault vault;
    TradeRouter trade;
    BookingRouter booking;
    Settlement settlement;
    HumanRegistry registry;
    PoolManager manager;
    Deployment d;
    NightToken token;
    NightConfig c;
    bytes32 night;
    address maker;
    address hookDeployer;
    address[] accounts;
    address[] tokens;
    uint256 minted;
    bytes32 firstBooking;
    bytes32 recallBooking;

    function setUp() public {
        vm.chainId(5042002);
        vm.warp(1893000000);
        vm.etch(USDC, type(MockUSDC).runtimeCode);
        bytes memory runtime = vm.parseBytes(vm.readFile("test/fixtures/Permit2.hex"));
        assertEq(keccak256(runtime), 0x53681d3cf8f702f849c1504b491049c3d0a282e4595d9b297c410dcf36f0908e);
        vm.etch(PERMIT2, runtime);
        manager = new PoolManager(PLATFORM);
        address f;
        hookDeployer = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 8);
        (f, d) = DeployLib.deploy(address(this), address(manager), USDC, PERMIT2, PLATFORM, vm.addr(ATTESTER_KEY), PLATFORM, 6000e6, 2000000e6, 100e18, 20);
        factory = NightFactory(f);
        vault = NightVault(d.vault);
        trade = TradeRouter(d.tradeRouter);
        booking = BookingRouter(d.bookingRouter);
        settlement = Settlement(d.settlement);
        registry = HumanRegistry(d.registry);
        maker = vm.addr(MAKER_KEY);
        accounts.push(address(this));
        accounts.push(HOST);
        accounts.push(maker);
        accounts.push(ALT);
        accounts.push(BUYER);
        accounts.push(GUEST);
        accounts.push(PLATFORM);
        _link(HOST, 1, true);
        _link(maker, 2, true);
        _link(ALT, 2, true);
        _link(BUYER, 3, true);
        _link(GUEST, 4, false);
        for (uint256 i; i < 4; ++i) {
            address a = address(uint160(0x900 + i));
            accounts.push(a);
            _link(a, 10 + i, true);
        }
        for (uint256 i; i < accounts.length; ++i) {
            _fund(accounts[i]);
        }
        cash.approve(d.coverFund, type(uint256).max);
        CoverFund(d.coverFund).deposit(100000e6);
        cash.approve(d.rebatePool, type(uint256).max);
        RebatePool(d.rebatePool).deposit(10000e6);
        bytes32 property = keccak256("hotel");
        uint64 deadline = uint64(block.timestamp + 1 days);
        factory.bindProperty(
            property,
            HOST,
            deadline,
            _sig(
                ATTESTER_KEY,
                OrderLib.digest(factory.DOMAIN_SEPARATOR(), OrderLib.hashProperty(property, HOST, deadline))
            )
        );
        _open(15, "double", "2030-01-01");
        _conserved();
    }

    function _sig(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _link(address a, uint256 human, bool orb) internal {
        uint64 deadline = uint64(block.timestamp + 1 days);
        registry.linkWallet(
            human,
            a,
            deadline,
            _sig(
                ATTESTER_KEY,
                OrderLib.digest(registry.DOMAIN_SEPARATOR(), OrderLib.hashWallet(human, a, deadline, false))
            )
        );
        vm.prank(vm.addr(ATTESTER_KEY));
        registry.setOrb(human, orb);
        if (!orb) {
            registry.linkGuest(human, a, deadline, _sig(ATTESTER_KEY,
                OrderLib.digest(registry.DOMAIN_SEPARATOR(), keccak256(abi.encode(
                    keccak256("LinkGuest(uint256 guestId,address wallet,uint64 deadline)"), human, a, deadline)))));
        }
    }

    function _fund(address a) internal {
        cash.mint(a, 10000000e6);
        minted += 10000000e6;
        vm.startPrank(a);
        cash.approve(PERMIT2, type(uint256).max);
        IAllowanceTransfer(PERMIT2).approve(USDC, d.tradeRouter, type(uint160).max, type(uint48).max);
        IAllowanceTransfer(PERMIT2).approve(USDC, d.bookingRouter, type(uint160).max, type(uint48).max);
        vm.stopPrank();
    }

    function _open(uint256 rooms, string memory room, string memory date) internal {
        night = factory.registerNightIdentity("hotel", room, date);
        (,, uint64 checkIn) = factory.identities(night);
        c = NightConfig(
            6000e6,
            1.2e18,
            rooms * 1e18,
            0,
            checkIn - 1 hours,
            HOST,
            keccak256("hotel"),
            keccak256(bytes(room)),
            night,
            checkIn
        );
        bytes32 salt;
        for (uint256 i;; ++i) {
            salt = bytes32(i);
            if (factory.predictToken(c, salt) < USDC) break;
        }
        uint256 gasBefore = gasleft();
        vm.prank(HOST);
        (, address t) = factory.openNight("hotel", room, date, c, salt);
        emit log_named_uint(rooms == 15 ? "open15" : "open100", gasBefore - gasleft());
        token = NightToken(t);
        tokens.push(t);
        c = factory.config(night);
        assertEq(token.totalSupply(), vault.requiredInventory(c));
        assertGt(token.dustMinted(), 0);
        uint256 totalGas;
        for (uint256 i; i < rooms; i += 10) {
            uint256 end = i + 10 > rooms ? rooms : i + 10;
            gasBefore = gasleft();
            vm.prank(HOST);
            factory.addLadderChunk(night, i, end);
            uint256 used = gasBefore - gasleft();
            totalGas += used;
            if (end - i == 10) emit log_named_uint("chunk10", used);
        }
        emit log_named_uint(rooms == 15 ? "ladder15" : "ladder100", totalGas);
        assertTrue(factory.ladderComplete(night));
        assertEq(vault.nextRoom(night), rooms);
    }

    function _conserved() internal view {
        uint256 total = cash.balanceOf(hookDeployer) + cash.balanceOf(d.settler) + cash.balanceOf(factory.tokenDeployer());
        for (uint256 i; i < accounts.length; ++i) {
            total += cash.balanceOf(accounts[i]);
        }
        for (uint256 i; i < tokens.length; ++i) {
            total += cash.balanceOf(tokens[i]);
        }
        total += cash.balanceOf(address(manager)) + cash.balanceOf(address(factory));
        total += cash.balanceOf(d.vault) + cash.balanceOf(d.hook) + cash.balanceOf(d.tradeRouter);
        total += cash.balanceOf(d.bookingRouter) + cash.balanceOf(d.settlement) + cash.balanceOf(d.registry);
        total += cash.balanceOf(d.coverFund) + cash.balanceOf(d.rebatePool) + cash.balanceOf(PERMIT2)
        + cash.balanceOf(USDC);
        assertEq(total, minted, "USDC conservation");
        assertEq(cash.totalSupply(), minted, "only explicit mints change supply");
        assertEq(cash.balanceOf(d.tradeRouter), 0, "trade cash stranded");
        assertEq(cash.balanceOf(d.bookingRouter), 0, "booking cash stranded");
        assertEq(cash.balanceOf(d.hook), 0, "hook cash stranded");
    }

    function _buy(address a, uint256 qty) internal returns (uint256 paid) {
        vm.prank(a);
        paid = trade.buy(night, qty, 10000000e6, new Ask[](0), new Hint[](0), type(uint64).max);
        _conserved();
    }

    function _ask(uint256 qty, uint256 price) internal view returns (Ask[] memory asks) {
        asks = new Ask[](1);
        Order memory o = Order(night, qty, price, uint64(c.cutoff - 1), trade.nonces(maker), maker);
        asks[0] = Ask(o, _sig(MAKER_KEY, OrderLib.digest(trade.DOMAIN_SEPARATOR(), OrderLib.hash(o))), qty);
    }

    function _price() internal view returns (uint256) {
        PoolKey memory key = factory.poolKey(night);
        (uint160 sqrtPrice,,,) = StateLibrary.getSlot0(IPoolManager(address(manager)), key.toId());
        return FullMath.mulDiv(uint256(sqrtPrice) * sqrtPrice, 1e18, 1 << 192);
    }

    function _trades() private {
        for (uint256 i; i < 20; ++i) {
            _buy(maker, 1e17);
        }
        for (uint256 i; i < 10; ++i) {
            _buy(ALT, 1e17);
        }
        for (uint256 i; i < 20; ++i) {
            _buy(BUYER, 1e17);
        }
        assertEq(token.humanBalance(2), 3e18);
        vm.expectRevert();
        vm.prank(ALT);
        trade.buy(night, 1.6e18, 100000e6, new Ask[](0), new Hint[](0), type(uint64).max);
        assertEq(token.humanBalance(2), 3e18);
        _conserved();
        Ask[] memory asks = _ask(8e17, _price() * 102 / 100);
        bytes32 digest = OrderLib.digest(trade.DOMAIN_SEPARATOR(), OrderLib.hash(asks[0].order));
        uint256 rebateBefore = cash.balanceOf(d.rebatePool);
        uint256 managerBefore = cash.balanceOf(address(manager));
        uint256 makerBefore = cash.balanceOf(maker);
        vm.recordLogs();
        vm.prank(BUYER);
        trade.buy(night, 1e18, 100000e6, asks, new Hint[](0), type(uint64).max);
        assertGt(trade.filled(digest), 0);
        assertLt(trade.filled(digest), 1e18);
        assertGt(cash.balanceOf(address(manager)), managerBefore);
        assertLt(cash.balanceOf(d.rebatePool), rebateBefore);
        uint256 gross = OrderLib.fillCost(trade.filled(digest), asks[0].order.price);
        uint256 rebate = rebateBefore - cash.balanceOf(d.rebatePool);
        assertEq(rebate, FeeMath.makerRebate(asks[0].order.price, _price(), trade.filled(digest), rebateBefore));
        assertEq(cash.balanceOf(maker) - makerBefore, gross + rebate);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool poolSeen;
        bool askSeen;
        bytes32 tradeTopic = keccak256("Trade(bytes32,address,address,uint8,uint256,uint256,uint256,uint256,uint256)");
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] != tradeTopic) continue;
            if (logs[i].emitter == d.hook) poolSeen = true;
            if (logs[i].emitter == d.tradeRouter) {
                assertTrue(poolSeen, "cheaper pool fills precede ask");
                askSeen = true;
            }
        }
        assertTrue(askSeen);
        _conserved();
        asks = _ask(1e17, 1e6);
        vm.prank(maker);
        trade.cancelAll();
        vm.expectRevert(ITradeRouter.InvalidNonce.selector);
        vm.prank(BUYER);
        trade.buy(night, 1e17, 100000e6, asks, new Hint[](0), type(uint64).max);
        _conserved();
    }

    function _bookAndRecall() private {
        Ask[] memory asks = _ask(4e17, 6000e6);
        uint256 beforeBurned = token.burned();
        vm.recordLogs();
        vm.prank(GUEST);
        (firstBooking,) = booking.buyAndRedeem(night, c.X, asks, new Hint[](0), type(uint64).max);
        _hasEvent(vm.getRecordedLogs(), keccak256("Booked(bytes32,address,bytes32,uint256,uint256)"), d.bookingRouter);
        assertEq(token.burned(), beforeBurned + 1e18);
        assertEq(trade.filled(OrderLib.digest(trade.DOMAIN_SEPARATOR(), OrderLib.hash(asks[0].order))), 4e17);
        _conserved();
        uint256 hostBefore = cash.balanceOf(HOST);
        vm.prank(address(0xDEAD));
        vault.sweep(night);
        assertGt(cash.balanceOf(HOST), hostBefore);
        assertTrue(vault.removed(night, 0));
        assertFalse(vault.removed(night, 1));
        _conserved();
        uint256 i;
        while (token.released() + token.burned() < c.S) {
            _buy(address(uint160(0x900 + (i++ % 4))), 1e17);
        }
        address largest = token.head();
        uint256 largestBalance = token.balanceOf(largest);
        uint256 largestCash = cash.balanceOf(largest);
        uint256 paid;
        vm.recordLogs();
        vm.prank(GUEST);
        (recallBooking, paid) = booking.buyAndRedeem(night, c.X);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        _hasEvent(logs, keccak256("Booked(bytes32,address,bytes32,uint256,uint256)"), d.bookingRouter);
        _hasEvent(logs, keccak256("Recalled(bytes32,address,address,uint256,uint256)"), address(token));
        assertEq(paid, c.X);
        assertEq(token.balanceOf(largest), largestBalance - 1e18);
        assertEq(cash.balanceOf(largest) - largestCash, c.X - FeeMath.halfUp(c.X, 130, 10000));
        assertEq(token.burned(), 2e18);
        _conserved();
    }

    function _hasEvent(Vm.Log[] memory logs, bytes32 topic, address emitter) private pure {
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == emitter && logs[i].topics[0] == topic) return;
        }
        revert("missing event");
    }

    function _walk(bytes32 id, uint256 number) private {
        Booking memory b = booking.booking(id);
        WalkAttestation memory r = WalkAttestation(
            bytes32(number),
            id,
            c.property,
            GUEST,
            b.paid,
            keccak256(abi.encode("reception", number)),
            c.checkIn,
            uint64(block.timestamp + 1 days)
        );
        uint256 guestBefore = cash.balanceOf(GUEST);
        uint256 claimsBefore = settlement.guestClaimTotal(HOST);
        settlement.reportWalk(r, _sig(ATTESTER_KEY, OrderLib.digest(settlement.DOMAIN_SEPARATOR(), OrderLib.hash(r))));
        assertEq(cash.balanceOf(GUEST) - guestBefore + settlement.guestClaimTotal(HOST) - claimsBefore, b.paid);
        assertTrue(settlement.reported(id));
        assertEq(settlement.evidenceHash(bytes32(number)), r.evidenceHash);
        _conserved();
    }

    function testPauseBlocksEntriesButAllowsCutoffClaimsAndWalk() public {
        _buy(maker, 1e18);
        _buy(BUYER, 1e18);
        _buy(ALT, 5e17);
        _buy(address(0x900), 5e17);
        vm.prank(maker); token.transfer(d.bookingRouter, 1e17);
        vm.prank(GUEST);
        (bytes32 bookingId,) = booking.buyAndRedeem(night, c.X);
        vm.prank(PLATFORM); token.setPaused(true);
        _pausedRoutes(false);
        vm.prank(PLATFORM); token.setPaused(false);
        vm.prank(PLATFORM); NightHook(d.hook).setPaused(true);
        _pausedRoutes(true);
        vm.prank(PLATFORM); token.setPaused(true);
        // Burns remain callable by their fixed endpoint while both pauses are active.
        vm.prank(d.bookingRouter); token.burn(1e17);
        vm.warp(c.checkIn);
        uint256 openBefore = factory.openNights();
        _cutoff();
        assertEq(factory.openNights(), openBefore - 1);
        _walk(bookingId, 99);
        vm.expectRevert(ISettlement.AlreadySettled.selector); settlement.settleCutoff(night);
        assertEq(factory.openNights(), openBefore - 1);
    }

    function _pausedRoutes(bool globalPause) private {
        Ask[] memory asks = _ask(1e17, 1);
        vm.expectRevert(Paused.selector); vm.prank(BUYER);
        trade.buy(night, 1e17, 100000e6, new Ask[](0), new Hint[](0), type(uint64).max);
        vm.expectRevert(Paused.selector); vm.prank(BUYER);
        trade.buy(night, 1e17, 100000e6, asks, new Hint[](0), type(uint64).max);
        vm.prank(maker); token.approve(d.tradeRouter, 1e17);
        vm.expectRevert(Paused.selector); vm.prank(maker);
        trade.sell(night, 1e17, 0, new Hint[](0), type(uint64).max);
        vm.expectRevert(Paused.selector); vm.prank(GUEST); booking.buyAndRedeem(night, c.X);
        vm.expectRevert(Paused.selector); vm.prank(maker); token.transfer(BUYER, 1e17);
        if (globalPause) {
            vm.expectRevert(Paused.selector); vm.prank(HOST); factory.openNight(c, bytes32(0));
        }
    }

    function testFullFlowConservesUSDC() public {
        _trades();
        _bookAndRecall();
        vm.warp(c.cutoff - 36 hours);
        uint256 rebateBefore = cash.balanceOf(d.rebatePool);
        vm.startPrank(ALT);
        token.approve(d.tradeRouter, 1e17);
        uint256 received = trade.sell(night, 1e17, 1, new Hint[](0), type(uint64).max);
        vm.stopPrank();
        assertGt(received, 0);
        assertGt(cash.balanceOf(d.rebatePool), rebateBefore);
        assertEq(FeeMath.lateFee(36 hours), 0.1565e18);
        _conserved();
        // Walk reports can be processed after cutoff even before cutoff settlement.
        uint256 pending = booking.booking(firstBooking).paid / 2;
        cash.approve(d.vault, pending);
        vault.creditPending(c.property, pending);
        _conserved();
        vm.warp(c.checkIn);
        // Quote the earned collection independently, then restore the unswept state.
        uint256 snapshot = vm.snapshotState();
        (uint256 earned,) = vault.sweep(night);
        assertTrue(vm.revertToStateAndDelete(snapshot));
        uint256 available = pending + earned;
        uint256 firstPaid = booking.booking(firstBooking).paid;
        uint256 expectedAdvance = firstPaid > available ? firstPaid - available : 0;
        uint256 fundBefore = cash.balanceOf(d.coverFund);
        _walk(firstBooking, 1);
        assertEq(settlement.hostDebt(HOST), expectedAdvance);
        assertEq(fundBefore - cash.balanceOf(d.coverFund), settlement.hostDebt(HOST));
        assertEq(vault.pending(c.property), available > firstPaid ? available - firstPaid : 0);
        assertTrue(vault.removed(night, 1));
        _walk(recallBooking, 2);
        assertEq(settlement.incidents(HOST), 2);
        bytes32 nextNight = factory.registerNightIdentity("hotel", "next", "2030-01-02");
        NightConfig memory next = c;
        next.night = nextNight;
        next.roomType = keccak256("next");
        next.checkIn += 1 days;
        next.cutoff += 1 days;
        vm.expectRevert(abi.encodeWithSelector(HostSuspended.selector, HOST));
        vm.prank(HOST);
        factory.openNight(next, bytes32(0));
        uint256 debt = settlement.hostDebt(HOST);
        // Both earned positions were consumed by walk refunds. Fund a later pending payout to exercise debt netting.
        uint256 laterPending = debt / 2;
        cash.approve(d.vault, laterPending);
        vault.creditPending(c.property, laterPending);
        vm.prank(address(0xDEAD));
        (, uint256 netted) = vault.sweep(night);
        assertGt(netted, 0);
        assertEq(netted, laterPending);
        assertEq(settlement.hostDebt(HOST), debt - netted);
        assertFalse(vault.removed(night, 2));
        _conserved();
        _cutoff();
    }

    function test_D2_E2EEmptyCoverFund() public {
        vm.prank(GUEST);
        (bytes32 id, uint256 paid) = booking.buyAndRedeem(night, c.X);
        uint256 fundBalance = cash.balanceOf(d.coverFund);
        vm.prank(d.coverFund);
        cash.transfer(address(this), fundBalance);
        uint256 beforeBalance = cash.balanceOf(GUEST);
        vm.warp(c.checkIn);
        _walk(id, 777);
        assertGt(settlement.guestClaimTotal(HOST), 0);
        assertEq(cash.balanceOf(GUEST) - beforeBalance + settlement.guestClaimTotal(HOST), paid);
        assertEq(settlement.hostDebt(HOST), 0);
        _conserved();
        cash.approve(d.vault, paid);
        vault.creditPending(c.property, paid);
        vault.sweep(night);
        assertEq(settlement.guestClaimTotal(HOST), 0);
        assertEq(cash.balanceOf(GUEST) - beforeBalance, paid);
        _conserved();
    }

    function _cutoff() private {
        address blocked = token.head();
        uint256 held = token.held();
        uint256 burned = token.burned();
        uint256 gasBefore = gasleft();
        settlement.settleCutoff(night);
        emit log_named_uint("cutoff15", gasBefore - gasleft());
        assertTrue(settlement.cutoffSettled(night));
        assertEq(settlement.remainingHeld(night), held);
        assertEq(token.totalSupply(), 0);
        assertEq(token.burned(), burned);
        assertEq(token.balanceOf(d.vault), 0);
        assertEq(token.balanceOf(address(manager)), 0);
        assertEq(token.balanceOf(d.settlement), 0);
        assertGt(settlement.claimable(night, blocked), 0);
        _conserved();
        cash.setBlacklisted(blocked, true);
        uint256 entitlement = settlement.claimable(night, blocked);
        settlement.pushBatch(night, 2);
        assertEq(settlement.claimable(night, blocked), entitlement);
        assertTrue(settlement.cursor(night) != address(0));
        _conserved();
        settlement.pushBatch(night, 100);
        assertEq(settlement.cursor(night), address(0));
        _conserved();
        cash.setBlacklisted(blocked, false);
        vm.prank(blocked);
        assertEq(settlement.claim(night), entitlement);
        assertEq(settlement.remainingHeld(night), 0);
        assertEq(settlement.remainingReserve(night), 0);
        assertEq(cash.balanceOf(d.settlement), 0);
        vm.prank(blocked);
        assertEq(settlement.claim(night), 0);
        _conserved();
    }

    function testFullSellout15AndOpening100InTenRoomChunks() public {
        uint256 gasBefore = gasleft();
        for (uint256 i; i < 150; ++i) {
            _buy(address(uint160(0x900 + i % 4)), 1e17);
        }
        emit log_named_uint("sellout15_tenths", gasBefore - gasleft());
        assertEq(token.released(), 15e18);
        assertEq(token.held(), 15e18);
        assertEq(token.balanceOf(address(manager)), token.dustMinted());
        vm.expectRevert();
        vm.prank(maker);
        trade.buy(night, 1e17, 100000e6, new Ask[](0), new Hint[](0), type(uint64).max);
        _conserved();
        _open(100, "hundred", "2030-01-02");
        assertEq(token.totalSupply(), 100e18 + token.dustMinted());
        _conserved();
        vm.warp(c.cutoff);
        gasBefore = gasleft();
        settlement.settleCutoff(night);
        emit log_named_uint("cutoff100_zeroHeld", gasBefore - gasleft());
        assertEq(token.totalSupply(), 0);
        _conserved();
    }

    function testCutoffPaysUnsweptHostRemainderAndClaimBeforePush() public {
        _buy(maker, 1e18);
        vm.prank(GUEST);
        booking.buyAndRedeem(night, c.X);
        _conserved();
        vm.warp(c.cutoff);
        uint256 hostBefore = cash.balanceOf(HOST);
        uint256 rebateBefore = cash.balanceOf(d.rebatePool);
        settlement.settleCutoff(night);
        assertGt(cash.balanceOf(HOST), hostBefore);
        assertGt(cash.balanceOf(d.rebatePool), rebateBefore);
        assertEq(token.burned(), 1e18);
        assertEq(token.totalSupply(), 0);
        _conserved();
        uint256 entitlement = settlement.claimable(night, maker);
        assertGt(entitlement, 0);
        vm.prank(maker);
        assertEq(settlement.claim(night), entitlement);
        settlement.pushBatch(night, 100);
        assertEq(settlement.remainingReserve(night), 0);
        _conserved();
    }

    function testGas100Rooms1000RealHoldersCutoff() public {
        _open(100, "thousand", "2030-01-02");
        Hint[] memory hints = new Hint[](1);
        for (uint256 i; i < 1000; ++i) {
            address a = address(uint160(0x10000 + i));
            accounts.push(a);
            _link(a, 1000 + i, true);
            _fund(a);
            hints[0] = Hint(a, i == 0 ? address(0) : address(uint160(0x10000 + i - 1)), address(0));
            vm.prank(a);
            trade.buy(night, 1e17, 100000e6, new Ask[](0), hints, type(uint64).max);
        }
        assertEq(token.holderCount(), 1000);
        assertEq(token.released(), 100e18);
        _conserved();
        vm.warp(c.cutoff);
        uint256 gasBefore = gasleft();
        settlement.settleCutoff(night);
        emit log_named_uint("cutoff100_1000holders", gasBefore - gasleft());
        assertEq(token.totalSupply(), 0);
        _conserved();
        gasBefore = gasleft();
        settlement.pushBatch(night, 500);
        emit log_named_uint("push500", gasBefore - gasleft());
        _conserved();
        settlement.pushBatch(night, 500);
        assertEq(settlement.remainingHeld(night), 0);
        assertEq(settlement.remainingReserve(night), 0);
        _conserved();
    }

    function testPermit2FiniteAllowanceChargesOnlyActualPayment() public {
        uint160 approved = 10000e6;
        vm.prank(maker);
        IAllowanceTransfer(PERMIT2).approve(USDC, d.tradeRouter, approved, type(uint48).max);
        uint256 beforeBalance = cash.balanceOf(maker);
        uint256 paid = _buy(maker, 1e17);
        (uint160 remaining,,) = IAllowanceTransfer(PERMIT2).allowance(maker, USDC, d.tradeRouter);
        assertEq(uint256(approved) - remaining, paid);
        assertEq(beforeBalance - cash.balanceOf(maker), paid);
        _conserved();
    }

    function testDeploymentWithBroadcastSender() public {
        uint256 deployerKey = 90000;
        address deployer = vm.addr(deployerKey);
        vm.startBroadcast(deployerKey);
        (address deployedFactory, Deployment memory peers) =
            DeployLib.deploy(deployer, address(manager), USDC, PERMIT2, PLATFORM, vm.addr(ATTESTER_KEY), PLATFORM, 6000e6, 2000000e6, 100e18, 20);
        vm.stopBroadcast();
        assertEq(address(NightVault(peers.vault).factory()), deployedFactory);
        assertEq(address(TradeRouter(peers.tradeRouter).factory()), deployedFactory);
        assertEq(BookingRouter(peers.bookingRouter).tradeRouter(), peers.tradeRouter);
        assertEq(CoverFund(peers.coverFund).settlement(), peers.settlement);
        assertEq(uint160(peers.hook) & 0x3fff, 0x2aec);
        assertEq(NightFactory(deployedFactory).dependencies().hook, peers.hook);
        _conserved();
    }
}
