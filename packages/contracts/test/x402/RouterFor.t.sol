// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {X402Fixture} from "./X402Fixture.sol";
import {INightToken} from "../../src/interfaces/INightToken.sol";
import {NightHook} from "../../src/NightHook.sol";
import {Vm} from "forge-std/Vm.sol";

contract RouterForTest is X402Fixture {
    function _fundSettler() internal {
        vm.prank(maker); cash.transfer(d.settler, 100000e6);
        vm.prank(d.settler); cash.approve(d.tradeRouter, 100000e6);
    }
    function _buyFor(address recipient, uint256 qty) internal returns (uint256) {
        vm.prank(d.settler); return trade.buyFor(recipient, night, qty, 100000e6, new Ask[](0), new Hint[](0), type(uint64).max);
    }
    function test_buyForChargesSettlerAndDeliversToAgent() public {
        _fundSettler(); uint256 before_ = cash.balanceOf(d.settler); uint256 agentBefore = cash.balanceOf(maker);
        vm.recordLogs(); uint256 paid = _buyFor(maker, 5e17); Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(token.balanceOf(maker), 5e17); assertEq(before_ - cash.balanceOf(d.settler), paid);
        assertEq(cash.balanceOf(maker), agentBefore); bool found;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == keccak256("Trade(bytes32,address,address,uint8,uint256,uint256,uint256,uint256,uint256)")) {
                assertEq(address(uint160(uint256(logs[i].topics[2]))), maker); found = true;
            }
        }
        assertTrue(found);
    }
    function test_buyForCapFollowsAgentHuman() public {
        _buy(ALT, token.cap()); _fundSettler();
        vm.expectRevert(abi.encodeWithSelector(INightToken.CapExceeded.selector, uint256(2), token.cap() + 1e17, token.cap()));
        vm.prank(d.settler); trade.buyFor(maker, night, 1e17, 100000e6, new Ask[](0), new Hint[](0), type(uint64).max);
    }
    function test_buyForHostAgentSendsHostShareToRebatePool() public {
        address agent = address(0xA601); _link(agent, 1, true); _fundSettler();
        uint256 rebateBefore = cash.balanceOf(d.rebatePool); uint256 hostBefore = cash.balanceOf(HOST);
        _buyFor(agent, 5e17); assertGt(cash.balanceOf(d.rebatePool), rebateBefore); assertEq(cash.balanceOf(HOST), hostBefore);
    }
    function test_sellForPaysAgent() public {
        _buy(maker, 1e18); vm.prank(maker); token.transfer(d.settler, 5e17);
        vm.warp(c.cutoff - 36 hours); uint256 before_ = cash.balanceOf(maker); uint256 rebateBefore = cash.balanceOf(d.rebatePool);
        vm.startPrank(d.settler); token.approve(d.tradeRouter, 5e17);
        uint256 received = trade.sellFor(maker, night, 5e17, 1, new Hint[](0), type(uint64).max); vm.stopPrank();
        assertEq(cash.balanceOf(maker) - before_, received); assertGt(received, 0);
        assertGt(cash.balanceOf(d.rebatePool), rebateBefore); assertEq(token.balanceOf(d.settler), 0);
    }
    function test_forCallsOnlyFromSettler() public {
        vm.expectRevert(Unauthorized.selector); trade.buyFor(maker, night, 1e17, 1e6, new Ask[](0), new Hint[](0), type(uint64).max);
        vm.expectRevert(Unauthorized.selector); trade.sellFor(maker, night, 1e17, 0, new Hint[](0), type(uint64).max);
    }
    function test_buyForUnverifiedRecipientReverts() public {
        _fundSettler(); vm.expectRevert(Unauthorized.selector); vm.prank(d.settler);
        trade.buyFor(GUEST, night, 1e17, 100000e6, new Ask[](0), new Hint[](0), type(uint64).max);
        vm.expectRevert(Unauthorized.selector); vm.prank(d.settler);
        trade.sellFor(GUEST, night, 1e17, 0, new Hint[](0), type(uint64).max);
    }
    function test_settlerOnlyAcceptsItsOwnAuthorizedPull() public {
        _buy(maker, 1e18);
        bytes memory sig = _sig(MAKER_KEY, keccak256(abi.encodePacked(hex"1901", token.DOMAIN_SEPARATOR(), keccak256(abi.encode(
            token.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(), maker, d.settler, uint256(1e17), uint256(0), type(uint256).max, bytes32(0))))));
        vm.expectRevert(Unauthorized.selector); token.transferWithAuthorization(maker, d.settler, 1e17, 0, type(uint256).max, 0, sig);
        vm.prank(d.settler); token.transferWithAuthorization(maker, d.settler, 1e17, 0, type(uint256).max, 0, sig);
        vm.prank(PLATFORM); NightHook(d.hook).setPaused(true);
        vm.expectRevert(Paused.selector); vm.prank(d.settler); token.transfer(maker, 1e17);
        assertEq(token.balanceOf(maker), 9e17);
        vm.expectRevert(Paused.selector); vm.prank(maker); token.transfer(d.settler, 1e17);
    }
}
