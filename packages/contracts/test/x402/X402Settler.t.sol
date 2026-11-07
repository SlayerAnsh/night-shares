// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {INightToken} from "../../src/interfaces/INightToken.sol";
import {Vm} from "forge-std/Vm.sol";
import {SettlerFixture} from "./SettlerFixture.sol";
import {IX402Settler} from "../../src/interfaces/IX402Settler.sol";
import {NightHook} from "../../src/NightHook.sol";

contract X402SettlerTest is SettlerFixture {
    function _manyLargerHolders() internal returns (Hint[] memory hints) {
        _open(30, "many-holders", "2030-01-01");
        _buy(maker, 2e17);
        // Descending addresses make each new equal-sized holder the head.
        for (uint256 i; i < 65; ++i) {
            address holder = address(uint160(0x2000 - i));
            accounts.push(holder);
            _link(holder, 100 + i, true);
            _fund(holder);
            _buy(holder, 3e17);
        }
        hints = new Hint[](1);
        hints[0] = Hint(maker, address(0x2000), address(0));
    }

    function test_M1_partialSellWithManyLargerHolders() public {
        Hint[] memory hints = _manyLargerHolders();
        IX402Settler.Authorization memory a = _sellAuth(1e17, 1, 0);
        bytes memory sig = _signature(address(token), a);
        vm.expectRevert(INightToken.HintSearchExhausted.selector);
        settler.sell(a, sig, night, 1, new Hint[](0), c.cutoff - 1, 0);
        assertEq(token.balanceOf(maker), 2e17);
        assertFalse(token.authorizationState(maker, a.nonce));
        assertFalse(settler.processed(address(token), maker, a.nonce));
        uint256 before_ = cash.balanceOf(maker);
        uint256 received = settler.sell(a, sig, night, 1, hints, c.cutoff - 1, 0);
        assertGt(received, 1);
        assertEq(cash.balanceOf(maker) - before_, received);
        assertEq(token.balanceOf(maker), 1e17);
        assertEq(token.prev(maker), address(0x2000));
        assertEq(token.next(address(0x2000)), maker);
        assertEq(token.holderCount(), 66);
        assertEq(token.balanceOf(d.settler), 0);
        assertEq(token.allowance(d.settler, d.tradeRouter), 0);
        _conserved();
    }

    function test_M1_settlerHintsRejectUntrustedCaller() public {
        Hint[] memory hints = new Hint[](1);
        hints[0] = Hint(maker, address(0), address(0));
        vm.expectRevert(Unauthorized.selector);
        token.setSettlerHints(hints);
        vm.prank(d.settler);
        token.setSettlerHints(hints);
    }

    function test_M1_buyWithManyLargerHolders() public {
        Hint[] memory hints = _manyLargerHolders();
        // Exit first so the next buy must insert the agent behind 65 holders.
        _settleSell(_sellAuth(2e17, 1, 0), 1, 0);
        IX402Settler.Authorization memory a = _buyAuth(1e17, 100000e6, 0);
        bytes memory sig = _signature(USDC, a);
        vm.expectRevert(INightToken.HintSearchExhausted.selector);
        settler.buy(a, sig, night, 1e17, new Ask[](0), new Hint[](0), c.cutoff - 1, 0);
        assertFalse(cash.authorizationState(maker, a.nonce));
        settler.buy(a, sig, night, 1e17, new Ask[](0), hints, c.cutoff - 1, 0);
        assertEq(token.balanceOf(maker), 1e17);
        assertEq(token.prev(maker), address(0x2000));
        assertEq(token.next(address(0x2000)), maker);
        _conserved();
    }

    function test_buyPullsPaysAndRefundsUnused() public {
        uint256 quote = _quote(5e17); IX402Settler.Authorization memory a = _buyAuth(5e17, quote + 10, 0);
        uint256 before_ = cash.balanceOf(maker);
        vm.expectEmit(true, true, false, true, d.settler); emit IX402Settler.X402Bought(night, maker, a.nonce, 5e17, quote, 10);
        assertEq(_settleBuy(a, 5e17, 0), quote); assertEq(before_ - cash.balanceOf(maker), quote);
        assertEq(token.balanceOf(maker), 5e17); assertEq(cash.balanceOf(d.settler), 0);
        assertEq(cash.allowance(d.settler, d.tradeRouter), 0); assertTrue(settler.processed(USDC, maker, a.nonce)); _conserved();
    }
    function test_buyRevertsAtomicallyWhenPriceMoved() public {
        IX402Settler.Authorization memory a = _buyAuth(5e17, _quote(5e17), 0); _buy(BUYER, 1e18);
        uint256 before_ = cash.balanceOf(maker); bytes memory sig = _signature(USDC, a);
        vm.expectRevert(Slippage.selector); settler.buy(a, sig, night, 5e17, new Ask[](0), new Hint[](0), c.cutoff - 1, 0);
        assertEq(cash.balanceOf(maker), before_); assertFalse(cash.authorizationState(maker, a.nonce));
        assertFalse(settler.processed(USDC, maker, a.nonce)); assertEq(cash.allowance(d.settler, d.tradeRouter), 0); _conserved();
    }
    function test_buyRejectsTermsMismatch() public {
        IX402Settler.Authorization memory a = _buyAuth(5e17, 100000e6, 0); bytes memory sig = _signature(USDC, a);
        vm.expectRevert(IX402Settler.TermsMismatch.selector); settler.buy(a, sig, night, 1e18, new Ask[](0), new Hint[](0), c.cutoff - 1, 0);
    }
    function test_sellPaysAgentAboveMinimum() public {
        _buy(maker, 1e18); IX402Settler.Authorization memory a = _sellAuth(5e17, 1, 0);
        uint256 before_ = cash.balanceOf(maker); uint256 received = _settleSell(a, 1, 0);
        assertGt(received, 1); assertEq(cash.balanceOf(maker) - before_, received);
        assertEq(token.balanceOf(d.settler), 0); assertEq(cash.balanceOf(d.settler), 0);
        assertEq(token.allowance(d.settler, d.tradeRouter), 0); assertTrue(settler.processed(address(token), maker, a.nonce)); _conserved();
    }
    function test_sellRevertsBelowMinimum() public {
        _buy(maker, 1e18); IX402Settler.Authorization memory a = _sellAuth(5e17, 100000e6, 0); bytes memory sig = _signature(address(token), a);
        vm.expectRevert(Slippage.selector); settler.sell(a, sig, night, 100000e6, new Hint[](0), c.cutoff - 1, 0);
        assertEq(token.balanceOf(maker), 1e18); assertFalse(token.authorizationState(maker, a.nonce));
        assertEq(token.allowance(d.settler, d.tradeRouter), 0); _conserved();
    }
    function test_donationDoesNotBrickSettler() public {
        _buy(maker, 1e18); vm.startPrank(maker); cash.transfer(d.settler, 123); token.transfer(d.settler, 1e17); vm.stopPrank();
        _settleBuy(_buyAuth(5e17, 100000e6, 0), 5e17, 0);
        _settleSell(_sellAuth(5e17, 1, 0), 1, 0);
        assertEq(cash.balanceOf(d.settler), 123); assertEq(token.balanceOf(d.settler), 1e17);
        assertEq(token.allowance(d.settler, d.tradeRouter), 0); assertEq(cash.allowance(d.settler, d.tradeRouter), 0); _conserved();
    }
    function test_directAuthToSettlerLeavesSettlerUsable() public {
        IX402Settler.Authorization memory direct = _buyAuth(5e17, 10e6, 0);
        uint256 before_ = cash.balanceOf(maker);
        _frontRun(direct);
        assertEq(before_ - cash.balanceOf(maker), direct.value);
        assertTrue(cash.authorizationState(maker, direct.nonce));
        assertFalse(settler.processed(USDC, maker, direct.nonce));
        assertEq(cash.balanceOf(d.settler), direct.value);

        bytes32 salt = bytes32(uint256(1));
        IX402Settler.Authorization memory buyAuth = _buyAuth(5e17, _quote(5e17) + 10, salt);
        before_ = cash.balanceOf(maker);
        uint256 paid = _settleBuy(buyAuth, 5e17, salt);
        assertEq(before_ - cash.balanceOf(maker), paid);
        assertEq(token.balanceOf(maker), 5e17);
        assertTrue(settler.processed(USDC, maker, buyAuth.nonce));
        assertEq(cash.balanceOf(d.settler), direct.value);
        assertEq(token.balanceOf(d.settler), 0);
        assertEq(cash.allowance(d.settler, d.tradeRouter), 0);

        IX402Settler.Authorization memory sellAuth = _sellAuth(5e17, 1, salt);
        before_ = cash.balanceOf(maker);
        uint256 received = _settleSell(sellAuth, 1, salt);
        assertGt(received, 1);
        assertEq(cash.balanceOf(maker) - before_, received);
        assertEq(token.balanceOf(maker), 0);
        assertTrue(settler.processed(address(token), maker, sellAuth.nonce));
        assertFalse(settler.processed(USDC, maker, direct.nonce));
        assertEq(cash.balanceOf(d.settler), direct.value);
        assertEq(token.balanceOf(d.settler), 0);
        assertEq(token.allowance(d.settler, d.tradeRouter), 0);
        _conserved();
    }
    function test_settlerHasNoRefundFunction() public {
        IX402Settler.Authorization memory a = _buyAuth(5e17, 10e6, 0);
        _frontRun(a);
        uint256 before_ = cash.balanceOf(maker);
        // Use the removed entry point's selector with a valid consumed authorization.
        (bool success,) = d.settler.call(abi.encodeWithSelector(bytes4(0x95216655), USDC, a, _signature(USDC, a)));
        assertFalse(success);
        assertEq(cash.balanceOf(maker), before_);
        assertEq(cash.balanceOf(d.settler), a.value);
        assertFalse(settler.processed(USDC, maker, a.nonce));
        _conserved();
    }
    function test_buyWhilePausedRevertsWithoutPayment() public {
        IX402Settler.Authorization memory a = _buyAuth(5e17, 100000e6, 0); bytes memory sig = _signature(USDC, a);
        uint256 before_ = cash.balanceOf(maker); vm.prank(PLATFORM); NightHook(d.hook).setPaused(true);
        vm.expectRevert(Paused.selector); settler.buy(a, sig, night, 5e17, new Ask[](0), new Hint[](0), c.cutoff - 1, 0);
        assertEq(cash.balanceOf(maker), before_); assertFalse(cash.authorizationState(maker, a.nonce)); _conserved();
    }
    function test_approvalsAreExactAndReset() public {
        IX402Settler.Authorization memory a = _buyAuth(5e17, 100000e6, 0);
        vm.recordLogs(); _settleBuy(a, 5e17, 0); _approvalLogs(vm.getRecordedLogs(), USDC, a.value);
        a = _sellAuth(5e17, 1, 0);
        vm.recordLogs(); _settleSell(a, 1, 0); _approvalLogs(vm.getRecordedLogs(), address(token), a.value);
    }
    function _approvalLogs(Vm.Log[] memory logs, address asset, uint256 value) private view {
        uint256 seen;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == asset && logs[i].topics[0] == keccak256("Approval(address,address,uint256)")
                && logs[i].topics[1] == bytes32(uint256(uint160(d.settler)))) {
                assertEq(logs[i].topics[2], bytes32(uint256(uint160(d.tradeRouter))));
                assertEq(abi.decode(logs[i].data, (uint256)), seen == 0 ? value : 0); ++seen;
            }
        }
        assertEq(seen, 2);
    }
    function test_noAdministrativeEntrypoints() public {
        (bool success,) = d.settler.call(abi.encodeWithSignature("owner()")); assertFalse(success);
        (success,) = d.settler.call(abi.encodeWithSignature("setPaused(bool)", true)); assertFalse(success);
        (success,) = d.settler.call(abi.encodeWithSignature("withdraw(address,uint256)", USDC, 1)); assertFalse(success);
    }
    function test_paymentRecipientAndSellTermsBound() public {
        IX402Settler.Authorization memory a = _buyAuth(5e17, 100000e6, 0); a.to = BUYER;
        bytes memory sig = _signature(USDC, a);
        vm.expectRevert(IX402Settler.NotSettlerPayment.selector);
        settler.buy(a, sig, night, 5e17, new Ask[](0), new Hint[](0), c.cutoff - 1, 0);
        _buy(maker, 1e18); a = _sellAuth(5e17, 1, 0); sig = _signature(address(token), a);
        vm.expectRevert(IX402Settler.TermsMismatch.selector);
        settler.sell(a, sig, night, 0, new Hint[](0), c.cutoff - 1, 0);
        vm.expectRevert(IX402Settler.TermsMismatch.selector);
        settler.sell(a, sig, night, 1, new Hint[](0), c.cutoff - 2, 0);
        vm.expectRevert(IX402Settler.TermsMismatch.selector);
        settler.sell(a, sig, night, 1, new Hint[](0), c.cutoff - 1, bytes32(uint256(1)));
        assertFalse(token.authorizationState(maker, a.nonce));
    }
    function test_nonceVectors() public view {
        assertEq(settler.buyNonce(bytes32(uint256(0x11)), 5e17, 200, bytes32(uint256(0x22))), 0xb7edcf74566291ca3b897170d1c967ac6174a777496922ccb8164309f876ee05);
        assertEq(settler.sellNonce(bytes32(uint256(0x11)), 1e6, 200, bytes32(uint256(0x22))), 0xfd0ee22bbc08f455709f3102c7561228f6c38cd689c997b500ee9736aba29011);
    }
}
