// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {ReviewFlowTest} from "./ReviewFlow.t.sol";
import {OrderLib} from "../src/libraries/OrderLib.sol";
import {INightToken} from "../src/interfaces/INightToken.sol";

contract DecisionsTest is ReviewFlowTest {
    function _guestSig(uint256 id, address wallet, uint64 deadline, bool relink) internal view returns (bytes memory) {
        bytes32 th = relink ? keccak256("RelinkGuest(uint256 guestId,address wallet,uint64 deadline)")
            : keccak256("LinkGuest(uint256 guestId,address wallet,uint64 deadline)");
        return _sig(ATTESTER_KEY, OrderLib.digest(registry.DOMAIN_SEPARATOR(), keccak256(abi.encode(th, id, wallet, deadline))));
    }
    function _selfie(address wallet, uint256 id) internal {
        uint64 deadline = uint64(block.timestamp + 1 days);
        registry.linkGuest(id, wallet, deadline, _guestSig(id, wallet, deadline, false));
    }
    function _emptyFund() internal {
        uint256 fundBalance = cash.balanceOf(d.coverFund);
        vm.prank(d.coverFund);
        cash.transfer(address(this), fundBalance);
    }
    function _pending(uint256 amount) internal {
        cash.approve(d.vault, amount);
        vault.creditPending(c.property, amount);
    }
    function test_D1_SelfieBooksButCannotTradeOrReceiveTokens() public {
        address guest = address(0x7777);
        accounts.push(guest); _fund(guest); _selfie(guest, 1);
        assertEq(registry.humanIdOf(guest), 0);
        assertTrue(registry.isVerified(guest)); assertFalse(registry.isOrb(guest));
        vm.prank(guest); booking.buyAndRedeem(night, c.X);
        vm.expectRevert(Unauthorized.selector);
        vm.prank(guest); trade.buy(night, 1e17, c.X, new Ask[](0), new Hint[](0), type(uint64).max);
        _buy(maker, 1e18);
        vm.expectRevert(abi.encodeWithSelector(INightToken.UnverifiedHuman.selector, guest));
        vm.prank(maker); token.transfer(guest, 1e17);
        assertEq(token.humanBalance(1), 0);
        _conserved();
    }
    function test_D1_GuestSignatureReplayRelinkAndDualBan() public {
        address wallet = address(0x7777);
        _link(wallet, 44, true);
        uint64 deadline = uint64(block.timestamp + 1 days);
        bytes memory sig = _guestSig(7, wallet, deadline, false);
        registry.linkGuest(7, wallet, deadline, sig);
        vm.expectRevert(); registry.linkGuest(7, wallet, deadline, sig);
        vm.expectRevert(InvalidSignature.selector);
        registry.linkGuest(7, BUYER, deadline, sig);
        registry.relinkGuest(8, wallet, deadline, _guestSig(8, wallet, deadline, true));
        vm.prank(PLATFORM); registry.banGuestReporter(7);
        assertTrue(registry.walkBanned(44)); assertTrue(registry.guestWalkBanned(8));
        assertFalse(registry.isVerified(wallet));
        sig = _guestSig(9, wallet, deadline, true);
        vm.expectRevert(); registry.relinkGuest(9, wallet, deadline, sig);
        // Equal numeric identifiers remain separate namespaces.
        assertTrue(registry.isOrb(HOST));
    }
    function test_D1_SelfieWalkAndBan() public {
        address guest = address(0x7777);
        accounts.push(guest); _fund(guest); _selfie(guest, 77);
        vm.prank(guest); (bytes32 id, uint256 paid) = booking.buyAndRedeem(night, c.X);
        WalkAttestation memory r = WalkAttestation(bytes32(uint256(101)), id, c.property, guest, paid,
            keccak256("selfie"), c.checkIn, c.checkIn + 1 days);
        vm.warp(c.checkIn);
        bytes memory sig = _sig(ATTESTER_KEY, OrderLib.digest(settlement.DOMAIN_SEPARATOR(), OrderLib.hash(r)));
        uint256 snap = vm.snapshotState();
        vm.prank(PLATFORM); registry.banGuestReporter(77);
        vm.expectRevert(Unauthorized.selector); settlement.reportWalk(r, sig);
        assertTrue(vm.revertToStateAndDelete(snap));
        settlement.reportWalk(r, sig);
        assertTrue(settlement.reported(id));
        assertEq(registry.humanIdOf(guest), 0);
        _conserved();
    }
    function test_D1_HumanLinkWithoutOrbIsNotVerified() public {
        address wallet = address(0x8888);
        uint64 deadline = uint64(block.timestamp + 1 days);
        registry.linkWallet(88, wallet, deadline, _sig(ATTESTER_KEY,
            OrderLib.digest(registry.DOMAIN_SEPARATOR(), OrderLib.hashWallet(88, wallet, deadline, false))));
        vm.prank(vm.addr(ATTESTER_KEY)); registry.setOrb(88, false);
        assertFalse(registry.isVerified(wallet));
        _selfie(wallet, 88);
        assertTrue(registry.isVerified(wallet));
        assertFalse(registry.isOrb(wallet));
    }
    function test_D1_GuestExpiryAndTypeSeparation() public {
        uint64 deadline = uint64(block.timestamp);
        bytes memory sig = _guestSig(77, address(0x7777), deadline, false);
        vm.warp(block.timestamp + 1);
        vm.expectRevert(Expired.selector); registry.linkGuest(77, address(0x7777), deadline, sig);
        deadline = uint64(block.timestamp + 1 days);
        sig = _sig(ATTESTER_KEY, OrderLib.digest(registry.DOMAIN_SEPARATOR(), OrderLib.hashWallet(77, address(0x7777), deadline, false)));
        vm.expectRevert(InvalidSignature.selector); registry.linkGuest(77, address(0x7777), deadline, sig);
    }
    function test_D2_OtherNightSweepPaysClaim() public {
        (bytes32 id, uint256 paid) = _bookOne(); vault.sweep(night);
        _open(15, "next", "2030-01-02");
        _bookOne(); _bookOne(); _emptyFund();
        Booking memory b = booking.booking(id);
        WalkAttestation memory r = WalkAttestation(bytes32(uint256(102)), id, c.property, GUEST, paid,
            keccak256("earlier"), b.checkIn, b.checkIn + 1 days);
        vm.warp(b.checkIn);
        settlement.reportWalk(r, _sig(ATTESTER_KEY, OrderLib.digest(settlement.DOMAIN_SEPARATOR(), OrderLib.hash(r))));
        assertEq(settlement.guestClaimTotal(HOST), paid);
        uint256 beforeBalance = cash.balanceOf(GUEST);
        vault.sweep(night);
        assertEq(cash.balanceOf(GUEST) - beforeBalance, paid);
        assertEq(settlement.guestClaimTotal(HOST), 0);
        _conserved();
    }
    function test_D2_OtherNightPendingCannotFundReport() public {
        (bytes32 id, uint256 paid) = _bookOne(); vault.sweep(night);
        _open(15, "next", "2030-01-02"); _bookOne();
        vm.prank(d.settlement); vault.collectEarned(night);
        uint256 otherPending = vault.pendingEarned(night);
        assertGt(otherPending, 0); _emptyFund();
        Booking memory b = booking.booking(id);
        WalkAttestation memory r = WalkAttestation(bytes32(uint256(103)), id, c.property, GUEST, paid,
            keccak256("earlier"), b.checkIn, b.checkIn + 1 days);
        vm.warp(b.checkIn);
        settlement.reportWalk(r, _sig(ATTESTER_KEY, OrderLib.digest(settlement.DOMAIN_SEPARATOR(), OrderLib.hash(r))));
        assertEq(settlement.guestClaimTotal(HOST), paid);
        assertEq(vault.pendingEarned(night), otherPending);
        _conserved();
    }
    function test_D2_EmptyFundPartialPayAndBlockedGuestCredit() public {
        (bytes32 id, uint256 paid) = _bookOne(); _emptyFund();
        cash.setBlacklisted(GUEST, true);
        vm.warp(c.checkIn); _report(id);
        uint256 credit = settlement.credits(GUEST);
        assertGt(credit, 0); assertLt(credit, paid);
        assertEq(settlement.guestClaimTotal(HOST), paid - credit);
        assertEq(settlement.hostDebt(HOST), 0);
        _pending(paid); vault.sweep(night);
        assertEq(settlement.credits(GUEST), paid);
        assertEq(settlement.guestClaimTotal(HOST), 0);
        cash.setBlacklisted(GUEST, false);
        assertEq(settlement.withdrawCredit(GUEST), paid);
        _conserved();
    }
    function test_D2_SweepPaysGuestThenFundThenHost() public {
        (bytes32 id, uint256 paid) = _bookOne(); vault.sweep(night); _emptyFund();
        cash.transfer(d.coverFund, 1e6);
        vm.warp(c.checkIn); _report(id);
        assertEq(settlement.hostDebt(HOST), 1e6);
        uint256 guestBefore = cash.balanceOf(GUEST);
        uint256 hostBefore = cash.balanceOf(HOST);
        _pending(paid + 5e6);
        uint256 gasBefore = gasleft(); vault.sweep(night);
        emit log_named_uint("sweep_guest_claim", gasBefore - gasleft());
        assertEq(cash.balanceOf(GUEST) - guestBefore, paid - 1e6);
        assertEq(cash.balanceOf(d.coverFund), 1e6);
        assertEq(cash.balanceOf(HOST) - hostBefore, 5e6);
        assertEq(settlement.hostDebt(HOST), 0); assertEq(settlement.guestClaimTotal(HOST), 0);
        _conserved();
    }
    function test_D2_CutoffPaysGuestFirst() public {
        (bytes32 id, uint256 paid) = _bookOne(); vault.sweep(night); _emptyFund();
        cash.transfer(d.coverFund, 1e6);
        vm.warp(c.checkIn); _report(id);
        _pending(paid + 5e6);
        uint256 guestBefore = cash.balanceOf(GUEST);
        uint256 hostBefore = cash.balanceOf(HOST);
        settlement.settleCutoff(night);
        assertEq(cash.balanceOf(GUEST) - guestBefore, paid - 1e6);
        assertGe(cash.balanceOf(HOST) - hostBefore, 5e6);
        assertEq(settlement.guestClaimTotal(HOST), 0);
        assertEq(settlement.hostDebt(HOST), 0);
        assertEq(cash.balanceOf(d.coverFund), 1e6);
        _conserved();
    }
    function test_D2_TwoClaimsFIFO() public {
        (bytes32 first, uint256 paid) = _bookOne();
        vm.prank(BUYER); (bytes32 second, uint256 paid2) = booking.buyAndRedeem(night, c.X);
        vault.sweep(night); _emptyFund(); vm.warp(c.checkIn); _report(first);
        WalkAttestation memory r = WalkAttestation(bytes32(uint256(100)), second, c.property, BUYER, paid2,
            keccak256("second"), c.checkIn, c.checkIn + 1 days);
        settlement.reportWalk(r, _sig(ATTESTER_KEY, OrderLib.digest(settlement.DOMAIN_SEPARATOR(), OrderLib.hash(r))));
        uint256 guestBefore = cash.balanceOf(GUEST);
        uint256 buyerBefore = cash.balanceOf(BUYER);
        _pending(paid - 1); vault.sweep(night);
        assertEq(cash.balanceOf(GUEST) - guestBefore, paid - 1);
        assertEq(cash.balanceOf(BUYER), buyerBefore);
        _pending(2); vault.sweep(night);
        assertEq(cash.balanceOf(GUEST) - guestBefore, paid);
        assertEq(cash.balanceOf(BUYER) - buyerBefore, 1);
        assertEq(settlement.guestClaimHead(HOST), 1);
        _conserved();
    }
    function test_L2_BlockedHostSweepCredit() public {
        _bookOne(); cash.setBlacklisted(HOST, true);
        vault.sweep(night); uint256 credit = vault.credits(HOST);
        assertGt(credit, 0);
        cash.setBlacklisted(HOST, false);
        assertEq(vault.withdrawCredit(HOST), credit);
        _conserved();
    }
    function test_L3_WalkAfterSellBack() public {
        (bytes32 id, uint256 paid) = _bookOne(); _buy(maker, 2e18);
        uint256 priceBefore = _price();
        vm.startPrank(maker); token.approve(d.tradeRouter, 2e18);
        trade.sell(night, 2e18, 0, new Hint[](0), type(uint64).max); vm.stopPrank();
        assertLt(_price(), priceBefore);
        uint256 guestBefore = cash.balanceOf(GUEST);
        vm.warp(c.checkIn); _report(id);
        assertEq(cash.balanceOf(GUEST) - guestBefore, paid);
        assertTrue(vault.removed(night, 0)); _conserved();
    }
    function test_D2_GasWalkAndSweep() public {
        (bytes32 id,) = _bookOne();
        uint256 gasBefore = gasleft(); vault.sweep(night);
        emit log_named_uint("sweep_no_debt", gasBefore - gasleft());
        vm.warp(c.checkIn); gasBefore = gasleft(); _report(id);
        emit log_named_uint("reportWalk_funded", gasBefore - gasleft());
    }
}
