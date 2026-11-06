// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {StdStorage, stdStorage} from "forge-std/StdStorage.sol";
import {FullFlowTest} from "./e2e/FullFlow.t.sol";
import {Credits} from "./ReviewToken.t.sol";
import {OrderLib} from "../src/libraries/OrderLib.sol";
import {FeeMath} from "../src/libraries/FeeMath.sol";
import {Vm} from "forge-std/Vm.sol";

contract ReviewFlowTest is FullFlowTest {
    using stdStorage for StdStorage;
    function _bookOne() internal returns (bytes32 id, uint256 paid) {
        vm.prank(GUEST);
        return booking.buyAndRedeem(night, c.X);
    }

    function test_F1_FractionalBookingRecall() public {
        _buy(maker, 4e18); _buy(BUYER, 4e18);
        _buy(address(0x900), 4e18); _buy(address(0x901), 3e18);
        Ask[] memory asks = _ask(7e17, 1e6);
        uint256 strike = (c.X * 3e17 + 1e18 - 1) / 1e18;
        vm.prank(GUEST);
        (bytes32 id, uint256 paid) = booking.buyAndRedeem(night, c.X, asks, new Hint[](0), type(uint64).max);
        assertEq(paid, 700000 + FeeMath.halfUp(700000, 130, 10000) + strike);
        assertEq(booking.booking(id).qty, 1e18);
        assertEq(token.burned(), 1e18);
        _conserved();
    }

    function test_F3_BlockedHostCutoff() public {
        _buy(maker, 1e18); _bookOne();
        cash.setBlacklisted(HOST, true);
        vm.warp(c.cutoff);
        settlement.settleCutoff(night);
        uint256 credit = Credits(d.settlement).credits(HOST);
        assertGt(credit, 0);
        uint256 entitlement = settlement.claimable(night, maker);
        uint256 beforeBalance = cash.balanceOf(maker);
        settlement.pushBatch(night, 100);
        assertEq(cash.balanceOf(maker) - beforeBalance, entitlement);
        assertGt(entitlement, 0);
        vm.expectRevert(); Credits(d.settlement).withdrawCredit(HOST);
        assertEq(Credits(d.settlement).credits(HOST), credit);
        cash.setBlacklisted(HOST, false);
        beforeBalance = cash.balanceOf(HOST);
        assertEq(Credits(d.settlement).withdrawCredit(HOST), credit);
        assertEq(cash.balanceOf(HOST) - beforeBalance, credit);
        assertEq(Credits(d.settlement).withdrawCredit(HOST), 0);
        _conserved();
    }

    function test_F3_BlockedPlatformSwap() public {
        cash.setBlacklisted(PLATFORM, true);
        vm.prank(maker);
        trade.buy(night, 1e18, c.X, new Ask[](0), new Hint[](0), type(uint64).max);
        assertEq(token.balanceOf(maker), 1e18);
        uint256 credit = Credits(d.hook).credits(PLATFORM);
        assertGt(credit, 0);
        cash.setBlacklisted(PLATFORM, false);
        uint256 beforeBalance = cash.balanceOf(PLATFORM);
        assertEq(Credits(d.hook).withdrawCredit(PLATFORM), credit);
        assertEq(cash.balanceOf(PLATFORM) - beforeBalance, credit);
        _conserved();
    }

    function test_F3_BlockedFundsCutoff() public {
        _buy(maker, 1e18); _bookOne();
        // Exercise the debt repayment leg as well as the haircut leg.
        stdstore.target(d.settlement).sig("hostDebt(address)").with_key(HOST).checked_write(1e6);
        cash.setBlacklisted(d.coverFund, true);
        cash.setBlacklisted(d.rebatePool, true);
        vm.warp(c.cutoff);
        settlement.settleCutoff(night);
        assertGt(Credits(d.settlement).credits(d.rebatePool), 0);
        assertEq(Credits(d.settlement).credits(d.coverFund), 1e6);
        uint256 entitlement = settlement.claimable(night, maker);
        uint256 beforeBalance = cash.balanceOf(maker);
        settlement.pushBatch(night, 100);
        assertEq(cash.balanceOf(maker) - beforeBalance, entitlement);
        cash.setBlacklisted(d.coverFund, false);
        cash.setBlacklisted(d.rebatePool, false);
        Credits(d.settlement).withdrawCredit(d.coverFund);
        Credits(d.settlement).withdrawCredit(d.rebatePool);
        _conserved();
    }

    function _report(bytes32 id) internal {
        Booking memory b = booking.booking(id);
        WalkAttestation memory r = WalkAttestation(bytes32(uint256(99)), id, c.property, GUEST, b.paid,
            keccak256("evidence"), c.checkIn, c.checkIn + 1 days);
        settlement.reportWalk(r, _sig(ATTESTER_KEY, OrderLib.digest(settlement.DOMAIN_SEPARATOR(), OrderLib.hash(r))));
    }

    function test_F5_UnsweptCoversWalk() public {
        (bytes32 id, uint256 paid) = _bookOne(); _bookOne();
        uint256 fundBefore = cash.balanceOf(d.coverFund);
        uint256 guestBefore = cash.balanceOf(GUEST);
        vm.warp(c.checkIn); _report(id);
        assertEq(cash.balanceOf(GUEST) - guestBefore, paid);
        assertEq(cash.balanceOf(d.coverFund), fundBefore);
        assertEq(settlement.hostDebt(HOST), 0);
        assertTrue(vault.removed(night, 0));
        assertTrue(vault.removed(night, 1));
        assertGt(vault.pending(c.property), 0);
        _conserved();
    }

    function test_F5_PartialUnsweptSplit() public {
        (bytes32 id, uint256 paid) = _bookOne();
        uint256 fundBefore = cash.balanceOf(d.coverFund);
        uint256 guestBefore = cash.balanceOf(GUEST);
        vm.warp(c.checkIn); _report(id);
        uint256 advance = fundBefore - cash.balanceOf(d.coverFund);
        assertGt(advance, 0); assertLt(advance, paid);
        assertEq(cash.balanceOf(GUEST) - guestBefore, paid);
        assertEq(settlement.hostDebt(HOST), advance);
        assertEq(vault.pending(c.property), 0);
        assertTrue(vault.removed(night, 0));
        _conserved();
    }

    function test_F5_NoUnsweptUsesCoverDebt() public {
        (bytes32 id, uint256 paid) = _bookOne(); vault.sweep(night);
        uint256 fundBefore = cash.balanceOf(d.coverFund);
        vm.warp(c.checkIn); _report(id);
        assertEq(fundBefore - cash.balanceOf(d.coverFund), paid);
        assertEq(settlement.hostDebt(HOST), paid);
        _conserved();
    }

    function test_F6_ReturnedRoomsEvent() public {
        _buy(maker, 2e18); _bookOne();
        uint256 returnedRooms = c.S - token.burned() - token.held();
        vm.warp(c.cutoff); vm.recordLogs(); settlement.settleCutoff(night);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool seen;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == d.settlement && logs[i].topics[0] == keccak256("CutoffReleased(bytes32,uint256,uint256)")) {
                assertEq(logs[i].topics[1], night);
                (uint256 rooms, uint256 rate) = abi.decode(logs[i].data, (uint256, uint256));
                assertEq(rooms, returnedRooms); assertEq(rate, settlement.refundPerNight(night)); seen = true;
            }
        }
        assertTrue(seen);
    }

    function test_F7_HostHumanMakerFee() public {
        // Move the signing maker onto the host's human identity before acquiring tokens.
        uint64 deadline = uint64(block.timestamp + 1 days);
        registry.relinkWallet(1, maker, deadline, _sig(ATTESTER_KEY,
            OrderLib.digest(registry.DOMAIN_SEPARATOR(), OrderLib.hashWallet(1, maker, deadline, true))));
        _buy(maker, 1e18);
        Ask[] memory asks = _ask(1e17, 1e6);
        uint256 hostBefore = cash.balanceOf(HOST);
        uint256 rebateBefore = cash.balanceOf(d.rebatePool);
        vm.prank(BUYER); trade.buy(night, 1e17, c.X, asks, new Hint[](0), type(uint64).max);
        assertEq(cash.balanceOf(HOST), hostBefore, "host maker fee goes to rebate pool");
        assertEq(cash.balanceOf(d.rebatePool) - rebateBefore, FeeMath.halfUp(1e5, 100, 10000) - FeeMath.makerRebate(1e6, _price(), 1e17, rebateBefore));
        _conserved();
    }

    function test_ReviewGasBookingCutoff() public {
        uint256 beforeGas = gasleft(); _bookOne();
        emit log_named_uint("review_buyAndRedeem", beforeGas - gasleft());
        _buy(maker, 1e18); vm.warp(c.cutoff);
        beforeGas = gasleft(); settlement.settleCutoff(night);
        emit log_named_uint("review_settleCutoff", beforeGas - gasleft());
    }
}
