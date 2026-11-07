// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {X402Fixture} from "./X402Fixture.sol";
import {IERC3009} from "../../src/interfaces/IERC3009.sol";
import {INightToken} from "../../src/interfaces/INightToken.sol";
import {NightHook} from "../../src/NightHook.sol";
import {OrderLib} from "../../src/libraries/OrderLib.sol";
import {NightToken} from "../../src/NightToken.sol";

contract NightToken3009Test is X402Fixture {
    function setUp() public override { super.setUp(); _buy(maker, 1e18); }
    function _auth(address to, uint256 value, uint256 after_, uint256 before_, bytes32 nonce) internal view returns (bytes memory) {
        return _sig(MAKER_KEY, keccak256(abi.encodePacked(hex"1901", token.DOMAIN_SEPARATOR(), keccak256(abi.encode(
            token.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(), maker, to, value, after_, before_, nonce)))));
    }
    function _send(address to, uint256 value, bytes32 nonce) internal {
        token.transferWithAuthorization(maker, to, value, 0, type(uint256).max, nonce, _auth(to, value, 0, type(uint256).max, nonce));
    }
    function test_authorizedTransferMovesTenths() public {
        _send(ALT, 5e17, bytes32(0)); assertEq(token.balanceOf(ALT), 5e17);
        assertEq(token.balanceOf(maker), 5e17); assertTrue(token.authorizationState(maker, bytes32(0)));
        assertTrue(token.inList(ALT)); assertTrue(token.inList(maker)); assertEq(token.humanBalance(2), 1e18);
        _send(ALT, 5e17, bytes32(uint256(1))); assertFalse(token.inList(maker)); assertEq(token.cachedHuman(maker), 0);
    }
    function test_authorizedTransferKeepsCap() public {
        _buy(BUYER, token.cap()); bytes memory sig = _auth(BUYER, 1e17, 0, type(uint256).max, 0);
        vm.expectRevert(abi.encodeWithSelector(INightToken.CapExceeded.selector, uint256(3), token.cap() + 1e17, token.cap()));
        token.transferWithAuthorization(maker, BUYER, 1e17, 0, type(uint256).max, 0, sig);
        assertFalse(token.authorizationState(maker, 0));
    }
    function test_authorizedTransferRejectsNonTenth() public {
        bytes memory sig = _auth(ALT, 1e16, 0, type(uint256).max, 0);
        vm.expectRevert(InvalidQuantity.selector); token.transferWithAuthorization(maker, ALT, 1e16, 0, type(uint256).max, 0, sig);
    }
    function test_replayAndWindowRejected() public {
        _send(ALT, 1e17, 0); bytes memory sig = _auth(ALT, 1e17, 0, type(uint256).max, 0);
        vm.expectRevert(IERC3009.AuthorizationReused.selector); token.transferWithAuthorization(maker, ALT, 1e17, 0, type(uint256).max, 0, sig);
        uint256 now_ = 100; vm.warp(100);
        sig = _auth(ALT, 1e17, now_, now_ + 10, bytes32(uint256(1)));
        vm.expectRevert(IERC3009.AuthorizationNotYetValid.selector); token.transferWithAuthorization(maker, ALT, 1e17, now_, now_ + 10, bytes32(uint256(1)), sig);
        vm.warp(now_ + 10);
        vm.expectRevert(IERC3009.AuthorizationExpired.selector); token.transferWithAuthorization(maker, ALT, 1e17, now_, now_ + 10, bytes32(uint256(1)), sig);
    }
    function test_pausedSameHumanTransferAllowed() public {
        vm.prank(PLATFORM); NightHook(d.hook).setPaused(true); _send(ALT, 5e17, 0);
        vm.prank(PLATFORM); token.setPaused(true); vm.prank(ALT); token.transfer(maker, 5e17);
        assertEq(token.balanceOf(maker), 1e18);
    }
    function test_pausedSettlerOriginTransferBlocked() public {
        vm.prank(maker);
        token.transfer(d.settler, 1e18);
        assertEq(token.balanceOf(d.settler), 1e18);
        for (uint256 i; i < 2; ++i) {
            vm.prank(PLATFORM);
            NightHook(d.hook).setPaused(i == 0);
            vm.prank(PLATFORM);
            token.setPaused(i == 1);
            vm.expectRevert(Paused.selector);
            vm.prank(d.settler);
            token.transfer(ALT, 1e18);
            assertEq(token.balanceOf(d.settler), 1e18);
            assertEq(token.balanceOf(ALT), 0);
        }
    }

    function test_pausedRelinkedWalletCannotTransferUnderOldHumanId() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        registry.relinkWallet(3, maker, deadline, _sig(ATTESTER_KEY,
            OrderLib.digest(registry.DOMAIN_SEPARATOR(), OrderLib.hashWallet(3, maker, deadline, true))));
        assertEq(registry.humanIdOf(maker), 3);
        assertEq(token.cachedHuman(maker), 2);
        assertEq(registry.humanIdOf(ALT), 2);
        for (uint256 i; i < 2; ++i) {
            vm.prank(PLATFORM);
            NightHook(d.hook).setPaused(i == 0);
            vm.prank(PLATFORM);
            token.setPaused(i == 1);
            vm.expectRevert(Paused.selector);
            vm.prank(maker);
            token.transfer(ALT, 1e18);
            assertEq(token.balanceOf(maker), 1e18);
            assertEq(token.balanceOf(ALT), 0);
        }
    }

    function test_pausedOtherHumanTransferBlocked() public {
        vm.prank(PLATFORM); NightHook(d.hook).setPaused(true);
        bytes memory sig = _auth(BUYER, 1e17, 0, type(uint256).max, 0);
        vm.expectRevert(Paused.selector); token.transferWithAuthorization(maker, BUYER, 1e17, 0, type(uint256).max, 0, sig);
    }
    function test_afterCutoffAuthorizedTransferBlocked() public {
        bytes memory sig = _auth(ALT, 1e17, 0, type(uint256).max, 0); vm.warp(c.cutoff);
        vm.expectRevert(CutoffReached.selector); token.transferWithAuthorization(maker, ALT, 1e17, 0, type(uint256).max, 0, sig);
    }
    function test_pausedExcludedEndpointsCannotUseSameHumanExemption() public {
        address[3] memory endpoints = [d.poolManager, d.tradeRouter, d.bookingRouter];
        vm.prank(PLATFORM); NightHook(d.hook).setPaused(true);
        for (uint256 i; i < endpoints.length; ++i) {
            _link(endpoints[i], 2, true);
            bytes memory sig = _auth(endpoints[i], 1e17, 0, type(uint256).max, bytes32(i));
            vm.expectRevert(Paused.selector);
            token.transferWithAuthorization(maker, endpoints[i], 1e17, 0, type(uint256).max, bytes32(i), sig);
        }
    }
    function test_authorizationDomainAndNoncePerAuthorizer() public {
        bytes32 wrong = keccak256(abi.encodePacked(hex"1901", cash.DOMAIN_SEPARATOR(), keccak256(abi.encode(
            token.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(), maker, ALT, uint256(1e17), uint256(0), type(uint256).max, bytes32(0)))));
        bytes memory sig = _sig(MAKER_KEY, wrong);
        vm.expectRevert(IERC3009.InvalidAuthorization.selector); token.transferWithAuthorization(maker, ALT, 1e17, 0, type(uint256).max, 0, sig);
        address other = vm.addr(702); accounts.push(other); _link(other, 2, true); _send(other, 5e17, 0);
        sig = _sig(702, keccak256(abi.encodePacked(hex"1901", token.DOMAIN_SEPARATOR(), keccak256(abi.encode(
            token.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(), other, ALT, uint256(5e17), uint256(0), type(uint256).max, bytes32(0))))));
        token.transferWithAuthorization(other, ALT, 5e17, 0, type(uint256).max, 0, sig);
        assertTrue(token.authorizationState(other, 0)); assertTrue(token.authorizationState(maker, 0));
    }
    function test_authorizedTransferExcludedAccounting() public {
        uint256 held = token.held(); _send(d.tradeRouter, 1e17, 0);
        assertFalse(token.inList(d.tradeRouter)); assertEq(token.humanBalance(2), 9e17); assertEq(token.held(), held - 1e17);
    }
    function test_typedDataVector() public {
        vm.chainId(5042); vm.etch(address(0x1000), address(token).code);
        IERC3009 fixedToken = IERC3009(address(0x1000));
        bytes32 digest = keccak256(abi.encodePacked(hex"1901", fixedToken.DOMAIN_SEPARATOR(), keccak256(abi.encode(
            fixedToken.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(), address(0x2000), address(0x3000), uint256(5e17), uint256(100), uint256(200), bytes32(uint256(1))))));
        assertEq(digest, 0x321cc95a8708d0c133b9dd225495cd1adc1a219dc0a4fcf77a521b1e937b999a);
        emit log_named_bytes32("NightToken3009 digest", digest);
    }
}
