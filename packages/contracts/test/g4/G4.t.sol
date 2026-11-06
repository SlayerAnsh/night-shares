// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Test} from "forge-std/Test.sol";
import {HumanRegistry} from "../../src/HumanRegistry.sol";
import {Settlement} from "../../src/Settlement.sol";
import {CoverFund} from "../../src/CoverFund.sol";
import {RebatePool} from "../../src/RebatePool.sol";
import {INightTypes} from "../../src/interfaces/INightTypes.sol";
import {IHumanRegistry} from "../../src/interfaces/IHumanRegistry.sol";
import {ISettlement} from "../../src/interfaces/ISettlement.sol";
import {OrderLib} from "../../src/libraries/OrderLib.sol";
import {MockUSDC} from "../mocks/MockUSDC.sol";
import {
    FactoryDouble,
    BookingDouble,
    TokenDouble,
    VaultDouble,
    BlacklistUSDC,
    SwapDouble
} from "../doubles/g4/Doubles.sol";
import {PoolManager} from "v4-core/src/PoolManager.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";

contract G4Test is Test, INightTypes {
    uint256 constant PK = 12345;
    bytes32 constant NIGHT = keccak256("night");
    bytes32 constant PROPERTY = keccak256("property");
    address constant HOST = address(0x111);
    address constant GUEST = address(0x222);
    address constant OTHER = address(0x333);
    HumanRegistry registry;
    Settlement settlement;
    CoverFund fund;
    RebatePool rebate;
    MockUSDC usdc;
    FactoryDouble factory;
    BookingDouble bookings;
    TokenDouble token;
    VaultDouble vault;
    PoolManager manager;
    SwapDouble swaps;
    PoolKey key;
    bytes32 registryDomain;
    bytes32 settlementDomain;

    function setUp() public {
        vm.warp(100000);
        MockUSDC underlying = new MockUSDC();
        BlacklistUSDC facade = new BlacklistUSDC(address(underlying));
        address cash = address(uint160(type(uint160).max - 1));
        vm.etch(cash, address(facade).code);
        usdc = MockUSDC(cash);
        manager = new PoolManager(address(this));
        registry = new HumanRegistry(address(this), vm.addr(PK));
        factory = new FactoryDouble();
        bookings = new BookingDouble();
        token = new TokenDouble();
        vault = new VaultDouble(IPoolManager(address(manager)), cash);
        swaps = new SwapDouble(IPoolManager(address(manager)));
        // Predict Settlement after the two immutable fund deployments.
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 2);
        fund = new CoverFund(cash, predicted);
        rebate = new RebatePool(cash, address(manager), address(factory), address(this), address(bookings));
        Deployment memory d;
        d.platform = address(this);
        d.usdc = cash;
        d.poolManager = address(manager);
        d.vault = address(vault);
        d.bookingRouter = address(bookings);
        d.registry = address(registry);
        d.coverFund = address(fund);
        d.rebatePool = address(rebate);
        settlement = new Settlement(address(factory), d, vm.addr(PK));
        assertEq(address(settlement), predicted);
        token.setSettlement(address(settlement));
        registryDomain = registry.DOMAIN_SEPARATOR();
        settlementDomain = settlement.DOMAIN_SEPARATOR();
        key = PoolKey(Currency.wrap(address(token)), Currency.wrap(cash), 0, 1, IHooks(address(0)));
        // The configured floor must lie below this single-position fixture's initial tick.
        factory.setup(
            NightConfig(10e6, 1e18, 100e18, 20000e6, 110000, HOST, PROPERTY, 0, NIGHT, 120000), key, address(token)
        );
        vault.setup(key, address(settlement));
        manager.initialize(key, TickMath.getSqrtPriceAtTick(-250000));
        token.mint(address(vault), 10000e18);
        usdc.mint(address(vault), 1e15);
        vault.add(1e15);
        usdc.mint(address(this), 1e15);
        usdc.approve(address(swaps), type(uint256).max);
        usdc.approve(address(fund), type(uint256).max);
        usdc.approve(address(rebate), type(uint256).max);
        usdc.approve(address(vault), type(uint256).max);
        registry.linkWallet(1, GUEST, 200000, walletSig(1, GUEST, 200000, false));
        vm.prank(vm.addr(PK));
        registry.setOrb(1, false);
        bookings.set(bytes32(uint256(1)), Booking(NIGHT, GUEST, 1e18, 100e6, 120000));
    }

    function sign(bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(PK, digest);
        return abi.encodePacked(r, s, v);
    }

    function walletSig(uint256 id, address wallet, uint64 deadline, bool relink) internal view returns (bytes memory) {
        return sign(OrderLib.digest(registryDomain, OrderLib.hashWallet(id, wallet, deadline, relink)));
    }

    function report(uint256 id) internal pure returns (WalkAttestation memory) {
        return WalkAttestation(bytes32(id), bytes32(id), PROPERTY, GUEST, 100e6, keccak256("evidence"), 120000, 210000);
    }

    function submit(WalkAttestation memory r) internal {
        settlement.reportWalk(r, sign(OrderLib.digest(settlementDomain, OrderLib.hash(r))));
    }

    function buy(address holder, uint256 qty) internal {
        swaps.buy(key, qty);
        token.transfer(holder, qty);
        token.markHolder(holder);
    }

    function testRegistryVerificationRelinkReplayAndBan() public {
        assertTrue(registry.isVerified(GUEST));
        assertFalse(registry.isOrb(GUEST));
        vm.prank(vm.addr(PK));
        registry.setOrb(2, false);
        bytes memory sig = walletSig(2, GUEST, 200000, true);
        registry.relinkWallet(2, GUEST, 200000, sig);
        assertEq(registry.humanIdOf(GUEST), 2);
        registry.relinkWallet(1, GUEST, 200001, walletSig(1, GUEST, 200001, true));
        vm.expectRevert(InvalidSignature.selector);
        registry.relinkWallet(2, GUEST, 200000, sig);
        registry.banWalkReporter(1);
        assertFalse(registry.isVerified(GUEST));
        vm.expectRevert(IHumanRegistry.UnsafeRelink.selector);
        registry.relinkWallet(2, GUEST, 200002, walletSig(2, GUEST, 200002, true));
    }

    function testRegistryRejectsUpgradeAndBadLinks() public {
        vm.prank(vm.addr(PK));
        registry.setOrb(2, true);
        vm.expectRevert(IHumanRegistry.UnsafeRelink.selector);
        registry.relinkWallet(2, GUEST, 200000, walletSig(2, GUEST, 200000, true));
        vm.expectRevert(IHumanRegistry.IdentityAlreadyBound.selector);
        registry.linkWallet(1, GUEST, 200000, "");
        vm.expectRevert(Expired.selector);
        registry.linkWallet(1, OTHER, 99999, "");
        vm.expectRevert(InvalidSignature.selector);
        registry.linkWallet(1, OTHER, 200000, "");
        vm.expectRevert(InvalidConfig.selector);
        registry.linkWallet(0, OTHER, 200000, "");
        vm.expectRevert(IHumanRegistry.UnsafeRelink.selector);
        registry.relinkWallet(2, OTHER, 200000, "");
    }

    function testRegistryAccessAndRotation() public {
        vm.startPrank(OTHER);
        vm.expectRevert(Unauthorized.selector);
        registry.setAttester(OTHER);
        vm.expectRevert(Unauthorized.selector);
        registry.setOrb(1, true);
        vm.expectRevert(Unauthorized.selector);
        registry.banWalkReporter(1);
        vm.stopPrank();
        vm.expectRevert(InvalidConfig.selector);
        registry.setAttester(address(0));
        registry.setAttester(OTHER);
        assertEq(registry.attester(), OTHER);
        vm.prank(OTHER);
        registry.setOrb(1, true);
        assertTrue(registry.isOrb(GUEST));
        vm.prank(OTHER);
        vm.expectRevert(InvalidConfig.selector);
        registry.setOrb(0, true);
        vm.expectRevert(InvalidConfig.selector);
        registry.banWalkReporter(0);
    }

    function testCoverAccessDepositsAndExactPayments() public {
        fund.deposit(10);
        assertEq(fund.balance(), 10);
        vm.expectRevert(Unauthorized.selector);
        fund.pay(GUEST, 1);
        vm.prank(address(settlement));
        vm.expectRevert(CoverFund.InsufficientCover.selector);
        fund.pay(GUEST, 11);
        vm.prank(address(settlement));
        fund.pay(GUEST, 10);
        assertEq(usdc.balanceOf(GUEST), 10);
        vm.prank(address(settlement));
        vm.expectRevert(InvalidConfig.selector);
        fund.pay(address(0), 0);
    }

    function testWalkWaterfallDebtAndFinalIncidents() public {
        vm.warp(120000);
        vault.creditPending(PROPERTY, 40e6);
        fund.deposit(200e6);
        submit(report(1));
        assertEq(usdc.balanceOf(GUEST), 100e6);
        assertEq(settlement.hostDebt(HOST), 60e6);
        assertEq(settlement.evidenceHash(bytes32(uint256(1))), keccak256("evidence"));
        assertTrue(settlement.reported(bytes32(uint256(1))));
        vm.expectRevert(ISettlement.DuplicateReport.selector);
        submit(report(1));
        WalkAttestation memory duplicate = report(1);
        duplicate.reportId = bytes32(uint256(10));
        vm.expectRevert(ISettlement.DuplicateReport.selector);
        submit(duplicate);
        bookings.set(bytes32(uint256(2)), Booking(NIGHT, GUEST, 1e18, 100e6, 120000));
        submit(report(2));
        assertEq(settlement.incidents(HOST), 2);
        assertEq(settlement.hostDebt(HOST), 160e6);
        vault.approveDebt();
        vm.prank(address(vault));
        assertEq(settlement.netDebt(HOST, 60e6), 60e6);
        vm.prank(address(vault));
        assertEq(settlement.netDebt(HOST, 200e6), 100e6);
        assertEq(settlement.hostDebt(HOST), 0);
    }

    function testWalkInsufficientCoverRollsBackAndRetries() public {
        vm.warp(120000);
        vault.creditPending(PROPERTY, 40e6);
        vm.expectRevert(ISettlement.InsufficientCover.selector);
        submit(report(1));
        assertEq(vault.pending(PROPERTY), 40e6);
        assertFalse(settlement.reported(bytes32(uint256(1))));
        assertEq(settlement.incidents(HOST), 0);
        fund.deposit(60e6);
        submit(report(1));
        assertEq(usdc.balanceOf(GUEST), 100e6);
    }

    function testWalkValidationAndAccess() public {
        vm.expectRevert(Unauthorized.selector);
        settlement.netDebt(HOST, 1);
        vm.prank(OTHER);
        vm.expectRevert(Unauthorized.selector);
        settlement.setAttester(OTHER);
        vm.expectRevert(InvalidConfig.selector);
        settlement.setAttester(address(0));
        vm.expectRevert(Unauthorized.selector);
        settlement.unlockCallback("");
        vm.prank(address(manager));
        vm.expectRevert(Unauthorized.selector);
        settlement.unlockCallback("");
        vm.warp(120000);
        WalkAttestation memory r = report(1);
        vm.expectRevert(InvalidSignature.selector);
        settlement.reportWalk(r, "");
        r.deadline = 119999;
        vm.expectRevert(Expired.selector);
        submit(r);
        r = report(1);
        r.paid++;
        vm.expectRevert(ISettlement.InvalidBooking.selector);
        submit(r);
        r = report(1);
        r.property = 0;
        vm.expectRevert(ISettlement.InvalidBooking.selector);
        submit(r);
        r = report(1);
        r.guest = OTHER;
        vm.expectRevert(ISettlement.InvalidBooking.selector);
        submit(r);
        r = report(1);
        r.reportedAt = 119999;
        vm.expectRevert(ISettlement.InvalidBooking.selector);
        submit(r);
        r = report(1);
        r.reportedAt = 120001;
        vm.expectRevert(ISettlement.InvalidBooking.selector);
        submit(r);
        vm.warp(206401);
        r.reportedAt = 206401;
        vm.expectRevert(ISettlement.InvalidBooking.selector);
        submit(r);
        registry.banWalkReporter(1);
        vm.expectRevert(Unauthorized.selector);
        submit(report(1));
        settlement.setAttester(OTHER);
        assertEq(settlement.attester(), OTHER);
    }

    function testRebateLivePriceCapAndAccess() public {
        rebate.deposit(1e6);
        assertEq(rebate.balance(), 1e6);
        vm.prank(OTHER);
        vm.expectRevert(Unauthorized.selector);
        rebate.payMaker(NIGHT, GUEST, 1, 1e18);
        assertEq(rebate.payMaker(NIGHT, GUEST, 1e12, 1e18), 0);
        uint256 paid = rebate.payMaker(NIGHT, GUEST, 10e6, 1e18);
        assertEq(paid, 50000);
        vm.prank(address(bookings));
        assertEq(rebate.payMaker(NIGHT, GUEST, 10e6, 100e18), 950000);
        assertEq(rebate.payMaker(NIGHT, GUEST, 10e6, 1e18), 0);
        vm.expectRevert(InvalidQuantity.selector);
        rebate.payMaker(NIGHT, GUEST, 1, 1);
        factory.setComplete(false);
        vm.expectRevert(LadderIncomplete.selector);
        rebate.payMaker(NIGHT, GUEST, 1, 1e18);
        vm.warp(110000);
        vm.expectRevert(CutoffReached.selector);
        rebate.payMaker(NIGHT, GUEST, 1, 1e18);
    }

    function testCutoffRealPoolFailedPushThenClaim() public {
        buy(GUEST, 1e18);
        buy(OTHER, 2e18);
        vm.expectRevert(BeforeCutoff.selector);
        settlement.settleCutoff(NIGHT);
        vm.expectRevert(BeforeCutoff.selector);
        settlement.claim(NIGHT);
        vm.expectRevert(BeforeCutoff.selector);
        settlement.pushBatch(NIGHT, 1);
        vm.warp(110000);
        settlement.settleCutoff(NIGHT);
        assertTrue(settlement.cutoffSettled(NIGHT));
        assertFalse(settlement.settling(NIGHT));
        assertTrue(token.dustBurned());
        assertGt(token.inventoryBurned(), 0);
        assertGt(rebate.balance(), 0);
        uint256 guest = settlement.claimable(NIGHT, GUEST);
        uint256 other = settlement.claimable(NIGHT, OTHER);
        assertGt(guest, 0);
        assertEq(other, guest * 2);
        BlacklistUSDC(address(usdc)).setBlocked(OTHER, true);
        settlement.pushBatch(NIGHT, 1);
        assertEq(settlement.cursor(NIGHT), GUEST);
        assertEq(settlement.claimable(NIGHT, OTHER), other);
        settlement.pushBatch(NIGHT, 1);
        assertEq(usdc.balanceOf(GUEST), guest);
        assertEq(settlement.claimable(NIGHT, GUEST), 0);
        vm.prank(GUEST);
        assertEq(settlement.claim(NIGHT), 0);
        vm.prank(OTHER);
        vm.expectRevert();
        settlement.claim(NIGHT);
        assertEq(settlement.claimable(NIGHT, OTHER), other);
        BlacklistUSDC(address(usdc)).setBlocked(OTHER, false);
        vm.prank(OTHER);
        assertEq(settlement.claim(NIGHT), other);
        assertEq(settlement.remainingReserve(NIGHT), 0);
        assertEq(settlement.remainingHeld(NIGHT), 0);
        settlement.pushBatch(NIGHT, 100);
        vm.expectRevert(ISettlement.AlreadySettled.selector);
        settlement.settleCutoff(NIGHT);
    }

    function testCutoffClaimBeforePushAndZeroHeld() public {
        buy(GUEST, 1e18);
        vm.warp(110000);
        settlement.settleCutoff(NIGHT);
        vm.prank(GUEST);
        uint256 paid = settlement.claim(NIGHT);
        assertGt(paid, 0);
        settlement.pushBatch(NIGHT, 100);
        assertEq(usdc.balanceOf(GUEST), paid);
    }

    function testCutoffZeroHeld() public {
        vm.warp(110000);
        settlement.settleCutoff(NIGHT);
        assertEq(settlement.refundPerNight(NIGHT), 0);
        settlement.pushBatch(NIGHT, 100);
        assertEq(settlement.claim(NIGHT), 0);
        assertEq(rebate.balance(), 0);
    }

    function testRegistryHistoricalBanAndDomainSeparation() public {
        vm.prank(vm.addr(PK));
        registry.setOrb(2, false);
        registry.relinkWallet(2, GUEST, 200000, walletSig(2, GUEST, 200000, true));
        registry.banWalkReporter(1);
        assertFalse(registry.isVerified(GUEST));
        bytes memory signature = walletSig(2, OTHER, 200000, false);
        vm.chainId(block.chainid + 1);
        assertTrue(registry.DOMAIN_SEPARATOR() != registryDomain);
        assertTrue(settlement.DOMAIN_SEPARATOR() != settlementDomain);
        vm.expectRevert(InvalidSignature.selector);
        registry.linkWallet(2, OTHER, 200000, signature);
    }

    function testLinkAtDeadlineReplayAndTypeSeparation() public {
        bytes memory signature = walletSig(1, OTHER, 100000, false);
        registry.linkWallet(1, OTHER, 100000, signature);
        vm.expectRevert(InvalidSignature.selector);
        registry.relinkWallet(2, OTHER, 100000, signature);
        vm.prank(vm.addr(PK));
        registry.setOrb(2, false);
        registry.relinkWallet(2, OTHER, 100000, walletSig(2, OTHER, 100000, true));
        vm.expectRevert(InvalidSignature.selector);
        registry.relinkWallet(1, OTHER, 100000, signature);
    }

    function testWalkPendingOnlyAndFailedGuestPaymentRollback() public {
        vm.warp(120000);
        vault.creditPending(PROPERTY, 100e6);
        BlacklistUSDC(address(usdc)).setBlocked(GUEST, true);
        vm.expectRevert();
        submit(report(1));
        assertEq(vault.pending(PROPERTY), 100e6);
        assertFalse(settlement.consumedReport(bytes32(uint256(1))));
        BlacklistUSDC(address(usdc)).setBlocked(GUEST, false);
        submit(report(1));
        assertEq(settlement.hostDebt(HOST), 0);
        assertEq(usdc.balanceOf(GUEST), 100e6);
    }

    function testWalkWindowBoundaryAndMissingBooking() public {
        vm.warp(206400);
        fund.deposit(100e6);
        vm.expectRevert(ISettlement.InvalidBooking.selector);
        submit(report(3));
        WalkAttestation memory r = report(1);
        r.reportedAt = 206400;
        r.deadline = 206400;
        submit(r);
        assertEq(settlement.incidents(HOST), 1);
    }

    function testCutoffNetsHostDebt() public {
        vm.warp(120000);
        fund.deposit(100e6);
        submit(report(1));
        uint256 previous = fund.balance();
        settlement.settleCutoff(NIGHT);
        assertEq(settlement.hostDebt(HOST), 0);
        assertEq(fund.balance(), previous + 100e6);
        assertGt(usdc.balanceOf(HOST), 0);
    }

    function testGasCutoff100Rooms1000Holders() public {
        swaps.buy(key, 100e18);
        for (uint256 i; i < 1000; ++i) {
            address holder = address(uint160(0x10000 + i));
            token.transfer(holder, 1e17);
            token.markHolder(holder);
        }
        vm.warp(110000);
        uint256 beforeGas = gasleft();
        settlement.settleCutoff(NIGHT);
        emit log_named_uint("Cutoff gas, S=100, 1000 holders, one test position", beforeGas - gasleft());
        beforeGas = gasleft();
        settlement.pushBatch(NIGHT, 1000);
        emit log_named_uint("Push 1000 gas", beforeGas - gasleft());
        assertEq(settlement.remainingHeld(NIGHT), 0);
        assertEq(settlement.remainingReserve(NIGHT), 0);
    }

    function testRelinkExpiryAndAttesterRotationInvalidateSignatures() public {
        vm.prank(vm.addr(PK));
        registry.setOrb(2, false);
        bytes memory signature = walletSig(2, GUEST, 99999, true);
        vm.expectRevert(Expired.selector);
        registry.relinkWallet(2, GUEST, 99999, signature);
        signature = walletSig(2, GUEST, 200000, true);
        registry.setAttester(OTHER);
        vm.expectRevert(InvalidSignature.selector);
        registry.relinkWallet(2, GUEST, 200000, signature);
        vm.expectRevert(InvalidConfig.selector);
        registry.linkWallet(1, address(0), 200000, "");
        vm.expectRevert(InvalidConfig.selector);
        registry.relinkWallet(0, GUEST, 200000, "");
    }

    function testConstructorZeroDependencies() public {
        vm.expectRevert(InvalidConfig.selector);
        new HumanRegistry(address(0), OTHER);
        vm.expectRevert(InvalidConfig.selector);
        new HumanRegistry(OTHER, address(0));
        vm.expectRevert(InvalidConfig.selector);
        new CoverFund(address(0), OTHER);
        vm.expectRevert(InvalidConfig.selector);
        new CoverFund(OTHER, address(0));
        vm.expectRevert(InvalidConfig.selector);
        new RebatePool(address(usdc), address(manager), address(factory), address(0), OTHER);
        Deployment memory d;
        vm.expectRevert(InvalidConfig.selector);
        new Settlement(address(factory), d, OTHER);
    }
}
