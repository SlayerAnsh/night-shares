// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {StdStorage, stdStorage} from "forge-std/StdStorage.sol";
import {NightTest} from "./g1/Night.t.sol";
import {NightToken} from "../src/NightToken.sol";
import {INightTypes} from "../src/interfaces/INightTypes.sol";

interface Credits {
    function credits(address recipient) external view returns (uint256);
    function withdrawCredit(address recipient) external returns (uint256);
}

contract HintAttacker is INightTypes {
    function attack(NightToken token, address to) external {
        Hint[] memory hints = new Hint[](1);
        hints[0] = Hint(address(this), to, address(0));
        token.setHints(hints);
        token.transfer(to, 1e17);
    }
}

contract ReviewTokenTest is NightTest {
    using stdStorage for StdStorage;

    function _recall(uint256 strike, uint256 a, uint256 b, uint256 third) internal {
        _open();
        stdstore.target(address(t)).sig(bytes4(keccak256("X()"))).checked_write(strike);
        _give(A, a);
        if (b != 0) _give(B, b);
        if (third != 0) { registry.set(address(0x300), 4, true); _give(address(0x300), third); }
        uint256 qty = a + b + third;
        uint256 expected = (strike * qty + 1e18 - 1) / 1e18;
        usdc.mint(address(t), expected);
        vm.prank(BOOK);
        assertEq(t.recall(qty, HOST), expected, "aggregate strike");
        assertEq(usdc.balanceOf(address(t)), 0);
        assertEq(usdc.balanceOf(A) + usdc.balanceOf(B) + usdc.balanceOf(address(0x300)) + usdc.balanceOf(HOOK), expected);
    }

    function test_F1_SingleFractional() public { _recall(24900876921, 3e17, 0, 0); }
    function test_F1_ThreeHolders() public { _recall(24900876923, 1e17, 1e17, 8e17); }
    function test_F1_FuzzSplits(uint64 x, uint8 a, uint8 b, uint8 c_) public {
        _recall(bound(x, 1, 1e15), bound(a, 1, 10) * 1e17, bound(b, 1, 10) * 1e17, bound(c_, 1, 10) * 1e17);
    }

    function _integrity(address[] memory holders) internal view {
        address at = t.head();
        address previous;
        uint256 count;
        uint256 sum;
        while (at != address(0)) {
            assertLt(count, holders.length, "cycle");
            assertEq(t.prev(at), previous);
            uint256 balance = t.balanceOf(at);
            assertGt(balance, 0);
            if (previous != address(0)) {
                uint256 beforeBalance = t.balanceOf(previous);
                assertTrue(beforeBalance > balance || (beforeBalance == balance && uint160(previous) < uint160(at)));
            }
            sum += balance;
            previous = at;
            at = t.next(at);
            ++count;
        }
        assertEq(count, t.holderCount(), "reachable count");
        assertEq(sum, t.held());
        for (uint256 i; i < holders.length; ++i) {
            if (t.balanceOf(holders[i]) == 0) continue;
            at = t.head();
            while (at != address(0) && at != holders[i]) at = t.next(at);
            assertEq(at, holders[i], "holder reachable");
        }
    }

    function test_L1_AdjacentReceiverHintBeyond64() public {
        _open();
        address[] memory holders = new address[](68);
        for (uint256 i; i < 66; ++i) {
            address who = address(uint160(0x1000 + i));
            holders[i] = who;
            registry.set(who, 100 + i, true);
            if (i != 0) _hint(who, holders[i - 1], address(0));
            _give(who, 2e17);
        }
        address from = address(0x2000);
        address to = address(0x3000);
        holders[66] = from; holders[67] = to;
        registry.set(from, 200, true); registry.set(to, 201, true);
        _give(from, 3e17);
        _hint(from, holders[65], address(0));
        _hint(to, from, address(0));
        vm.prank(from); t.transfer(to, 1e17);
        assertEq(t.prev(to), from);
        _integrity(holders);
    }

    function test_L1_F2AttackStillCannotCorruptList() public {
        test_F2_CounterpartyHint();
    }

    function test_F2_CounterpartyHint() public {
        _open();
        HintAttacker attacker = new HintAttacker();
        registry.set(address(attacker), 5, true);
        _give(address(attacker), 2e17);
        _give(B, 3e17);
        attacker.attack(t, B);
        address[] memory holders = new address[](2);
        holders[0] = address(attacker); holders[1] = B;
        _integrity(holders);
        vm.prank(address(attacker)); t.transfer(B, 1e17);
        _integrity(holders);
    }

    function test_F2_FuzzTransfersHints(bytes32 seed) public {
        _open();
        address[] memory holders = new address[](4);
        for (uint256 i; i < 4; ++i) {
            holders[i] = address(uint160(0x500 + i));
            registry.set(holders[i], 10 + i, true);
            _give(holders[i], 5e17);
        }
        for (uint256 i; i < 32; ++i) {
            seed = keccak256(abi.encode(seed, i));
            uint256 bits = uint256(seed);
            address from = holders[bits % 4];
            address to = holders[(bits >> 8) % 4];
            Hint[] memory hints = new Hint[](2);
            hints[0] = Hint(from, holders[(bits >> 16) % 4], address(0));
            hints[1] = Hint(to, holders[(bits >> 24) % 4], holders[(bits >> 32) % 4]);
            t.setHints(hints);
            if (t.balanceOf(from) != 0) { vm.prank(from); t.transfer(to, 1e17); }
            _integrity(holders);
        }
    }

    function test_F4_BlockedLargestRecallCredit() public {
        _open(); _give(A, 8e17); _give(B, 2e17);
        usdc.mint(address(t), t.X());
        usdc.setBlacklisted(A, true);
        vm.prank(BOOK); assertEq(t.recall(1e18, HOST), t.X());
        uint256 credit = Credits(address(t)).credits(A);
        assertGt(credit, 0);
        assertEq(t.balanceOf(A), 0);
        assertGt(usdc.balanceOf(B), 0);
        vm.expectRevert(); Credits(address(t)).withdrawCredit(A);
        assertEq(Credits(address(t)).credits(A), credit);
        usdc.setBlacklisted(A, false);
        assertEq(Credits(address(t)).withdrawCredit(A), credit);
        assertEq(usdc.balanceOf(A), credit);
        assertEq(Credits(address(t)).withdrawCredit(A), 0);
    }
}
