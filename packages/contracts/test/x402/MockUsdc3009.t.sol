// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../mocks/MockUSDC.sol";

contract MockUsdc3009Test is Test {
    MockUSDC token;
    address from;
    function setUp() public { token = new MockUSDC(); from = vm.addr(123); token.mint(from, 10e6); vm.warp(100); }
    function signature(uint256 key) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked(hex"1901", token.DOMAIN_SEPARATOR(), keccak256(abi.encode(
            token.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(), from, address(this), uint256(5e6), uint256(99), uint256(200), bytes32(0)))));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }
    function send(bytes memory sig) internal { token.transferWithAuthorization(from, address(this), 5e6, 99, 200, bytes32(0), sig); }
    function test_transferWithAuthorizationMovesValueOnce() public {
        bytes memory sig = signature(123); send(sig);
        assertEq(token.balanceOf(address(this)), 5e6); assertTrue(token.authorizationState(from, bytes32(0)));
        vm.expectRevert(); send(sig);
    }
    function test_rejectsBeforeValidAfterAndAtValidBefore() public {
        bytes memory sig = signature(123); vm.warp(99); vm.expectRevert(); send(sig);
        vm.warp(200); vm.expectRevert(); send(sig);
    }
    function test_rejectsWrongSigner() public { bytes memory sig = signature(124); vm.expectRevert(); send(sig); }
    function test_vrsOverloadAndBlacklist() public {
        bytes memory sig = signature(123);
        bytes32 r; bytes32 s; uint8 v;
        assembly ("memory-safe") { r := mload(add(sig, 32)) s := mload(add(sig, 64)) v := byte(0, mload(add(sig, 96))) }
        token.setBlacklisted(from, true); vm.expectRevert(bytes("USDC blacklisted"));
        token.transferWithAuthorization(from, address(this), 5e6, 99, 200, bytes32(0), v, r, s);
        assertFalse(token.authorizationState(from, 0)); token.setBlacklisted(from, false);
        token.transferWithAuthorization(from, address(this), 5e6, 99, 200, bytes32(0), v, r, s);
        assertEq(token.balanceOf(address(this)), 5e6);
    }
    function test_domainFollowsEtchedAddress() public {
        address target = 0x3600000000000000000000000000000000000000;
        vm.etch(target, address(token).code);
        assertEq(MockUSDC(target).DOMAIN_SEPARATOR(), keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("USDC"), keccak256("2"), block.chainid, target)));
    }
}
