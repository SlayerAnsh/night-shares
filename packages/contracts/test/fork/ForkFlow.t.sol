// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {X402Settler} from "../../src/X402Settler.sol";
import {IX402Settler} from "../../src/interfaces/IX402Settler.sol";
import {IERC3009} from "../../src/interfaces/IERC3009.sol";
import {Test} from "forge-std/Test.sol";
import {INightTypes} from "../../src/interfaces/INightTypes.sol";
import {NightFactory} from "../../src/NightFactory.sol";
import {NightToken} from "../../src/NightToken.sol";
import {NightHook} from "../../src/NightHook.sol";
import {NightVault} from "../../src/NightVault.sol";
import {TradeRouter} from "../../src/TradeRouter.sol";
import {BookingRouter} from "../../src/BookingRouter.sol";
import {Settlement} from "../../src/Settlement.sol";
import {HumanRegistry} from "../../src/HumanRegistry.sol";
import {CoverFund} from "../../src/CoverFund.sol";
import {OrderLib} from "../../src/libraries/OrderLib.sol";
import {MockUSDC} from "../mocks/MockUSDC.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

/// @notice Uses the deployed system and existing mainnet PoolManager and Permit2.
/// Local fork mutations are discarded by Forge; this test never broadcasts.
contract ForkFlowTest is Test, INightTypes {
    string constant MNEMONIC = "test test test test test test test test test test test junk";
    NightFactory factory;
    HumanRegistry registry;
    TradeRouter trade;
    BookingRouter booking;
    Settlement settlement;
    NightVault vault;
    NightToken token;
    MockUSDC cash;
    Deployment d;
    address[5] wallets;
    uint256 attesterKey;
    NightConfig c;
    bytes32 night;

    function testLiveForkFullFlow() public {
        string memory rpc = vm.envOr("FORK_RPC", string(""));
        if (bytes(rpc).length == 0) { vm.skip(true); return; }
        vm.createSelectFork(rpc);
        assertEq(block.chainid, 5042);
        string memory json = vm.readFile("deployments/5042-fork.json");
        factory = NightFactory(vm.parseJsonAddress(json, ".NightFactory"));
        d = factory.dependencies();
        assertEq(d.poolManager, 0x8366a39CC670B4001A1121B8F6A443A643e40951);
        assertEq(d.poolManager.code.length, 24009);
        assertGt(d.permit2.code.length, 0);
        registry = HumanRegistry(d.registry);
        trade = TradeRouter(d.tradeRouter);
        booking = BookingRouter(d.bookingRouter);
        settlement = Settlement(d.settlement);
        vault = NightVault(d.vault);
        cash = MockUSDC(d.usdc);
        attesterKey = vm.deriveKey(MNEMONIC, 9);
        assertEq(settlement.attester(), vm.addr(attesterKey));
        for (uint256 i; i < 5; ++i) {
            wallets[i] = vm.addr(100 + i);
            _linkAndFund(wallets[i], 100 + i);
        }
        _open();
        uint256 count = factory.openNights();
        _trade();
        _x402();
        // Buy the remaining inventory across four independent humans, each below the 30% cap.
        uint256 n;
        while (token.released() < c.S) {
            address buyer = wallets[n++ % 4];
            if (token.balanceOf(buyer) < token.cap()) _buy(buyer, 1e17);
        }
        vm.prank(wallets[4]);
        (bytes32 bookingId, uint256 paid) = booking.buyAndRedeem(night, c.X);
        assertEq(token.burned(), 1e18);
        assertEq(token.held(), 9e18, "booking recalled one room from holders");
        uint256 hostBefore = cash.balanceOf(wallets[0]);
        vault.sweep(night);
        assertGt(cash.balanceOf(wallets[0]), hostBefore);
        cash.mint(address(this), 50e6);
        cash.approve(d.coverFund, 50e6);
        CoverFund(d.coverFund).deposit(50e6);
        vm.prank(vm.parseJsonAddress(json, ".OWNER"));
        NightHook(d.hook).setPaused(true);
        vm.prank(vm.parseJsonAddress(json, ".OWNER"));
        token.setPaused(true);
        vm.warp(c.checkIn);
        WalkAttestation memory report = WalkAttestation(keccak256("fork-report"), bookingId, c.property,
            wallets[4], paid, keccak256("reception-evidence"), c.checkIn, c.checkIn + 1 days);
        uint256 guestBefore = cash.balanceOf(wallets[4]);
        settlement.reportWalk(report, _sig(attesterKey, OrderLib.digest(settlement.DOMAIN_SEPARATOR(), OrderLib.hash(report))));
        assertEq(cash.balanceOf(wallets[4]) - guestBefore, paid);
        assertEq(settlement.incidents(wallets[0]), 1);
        settlement.settleCutoff(night);
        assertEq(factory.openNights(), count - 1);
        assertEq(token.totalSupply(), 0);
        address claimant = token.head();
        uint256 claimable = settlement.claimable(night, claimant);
        assertGt(claimable, 0);
        cash.setBlacklisted(claimant, true);
        settlement.pushBatch(night, 100);
        assertEq(settlement.claimable(night, claimant), claimable);
        cash.setBlacklisted(claimant, false);
        vm.prank(claimant);
        assertEq(settlement.claim(night), claimable);
        assertEq(settlement.remainingHeld(night), 0);
        assertEq(settlement.remainingReserve(night), 0);
        emit log_named_address("real mainnet PoolManager", d.poolManager);
        emit log_named_address("deployed TradeRouter", d.tradeRouter);
        emit log_named_uint("demo ladder full cost, micro USDC", factory.poolCost(c));
        emit log("bind/link/open/buy/ask/sell/recall booking/sweep/walk/cutoff/pushBatch/claim passed");
    }

    function _linkAndFund(address wallet, uint256 human) private {
        vm.etch(wallet, ""); // Public fixture keys must behave as EOAs on the local test fork.
        uint64 deadline = uint64(block.timestamp + 1 days);
        registry.linkWallet(human, wallet, deadline, _sig(attesterKey,
            OrderLib.digest(registry.DOMAIN_SEPARATOR(), OrderLib.hashWallet(human, wallet, deadline, false))));
        vm.prank(vm.addr(attesterKey)); registry.setOrb(human, true);
        cash.mint(wallet, 1000e6);
        vm.startPrank(wallet);
        cash.approve(d.permit2, type(uint256).max);
        IAllowanceTransfer(d.permit2).approve(d.usdc, d.tradeRouter, type(uint160).max, type(uint48).max);
        IAllowanceTransfer(d.permit2).approve(d.usdc, d.bookingRouter, type(uint160).max, type(uint48).max);
        vm.stopPrank();
    }

    function _open() private {
        bytes32 property = keccak256("fork-flow");
        uint64 deadline = uint64(block.timestamp + 1 days);
        factory.bindProperty(property, wallets[0], deadline, _sig(attesterKey,
            OrderLib.digest(factory.DOMAIN_SEPARATOR(), OrderLib.hashProperty(property, wallets[0], deadline))));
        night = factory.registerNightIdentity("fork-flow", "double", "2030-01-02");
        (,, uint64 checkIn) = factory.identities(night);
        c = NightConfig(500000, 1.2e18, 10e18, 0, checkIn - 1 hours, wallets[0], property,
            keccak256("double"), night, checkIn);
        bytes32 salt;
        for (uint256 i;; ++i) {
            salt = bytes32(i);
            if (factory.predictToken(c, salt) < d.usdc) break;
        }
        vm.startPrank(wallets[0]);
        (, address t) = factory.openNight(c, salt);
        factory.addLadderChunk(night, 0, 10);
        vm.stopPrank();
        token = NightToken(t);
        c = factory.config(night);
        assertTrue(factory.ladderComplete(night));
    }

    function _buy(address buyer, uint256 qty) private {
        vm.prank(buyer);
        assertGt(trade.buy(night, qty, 50e6, new Ask[](0), new Hint[](0), type(uint64).max), 0);
    }

    function _trade() private {
        _buy(wallets[1], 2e18);
        Order memory order = Order(night, 5e17, 400000, uint64(c.cutoff - 1), trade.nonces(wallets[1]), wallets[1]);
        bytes32 digest = OrderLib.digest(trade.DOMAIN_SEPARATOR(), OrderLib.hash(order));
        Ask[] memory asks = new Ask[](1);
        asks[0] = Ask(order, _sig(101, digest), 5e17);
        vm.prank(wallets[2]);
        trade.buy(night, 5e17, 50e6, asks, new Hint[](0), type(uint64).max);
        assertEq(trade.filled(digest), 5e17);
        vm.startPrank(wallets[1]);
        token.approve(d.tradeRouter, 1e17);
        assertGt(trade.sell(night, 1e17, 1, new Hint[](0), type(uint64).max), 0);
        vm.stopPrank();
    }

    function _x402() private {
        X402Settler settler = X402Settler(d.settler);
        assertGt(d.settler.code.length, 0);
        uint64 deadline = c.cutoff - 1;
        IX402Settler.Authorization memory a = IX402Settler.Authorization(wallets[2], d.settler, 5e6, 0, c.cutoff,
            settler.buyNonce(night, 5e17, deadline, bytes32(uint256(1))));
        uint256 cashBefore = cash.balanceOf(wallets[2]);
        uint256 tokenBefore = token.balanceOf(wallets[2]);
        uint256 paid = settler.buy(a, _authSig(d.usdc, a), night, 5e17, new Ask[](0), new Hint[](0), deadline, bytes32(uint256(1)));
        assertEq(cashBefore - cash.balanceOf(wallets[2]), paid);
        assertEq(token.balanceOf(wallets[2]) - tokenBefore, 5e17);
        a.value = 5e17; a.nonce = settler.sellNonce(night, 1, deadline, bytes32(uint256(2)));
        uint256 received = settler.sell(a, _authSig(address(token), a), night, 1, new Hint[](0), deadline, bytes32(uint256(2)));
        assertEq(cash.balanceOf(wallets[2]), cashBefore - paid + received);
        assertEq(token.balanceOf(wallets[2]), tokenBefore);
        assertEq(cash.balanceOf(d.settler), 0); assertEq(token.balanceOf(d.settler), 0);
        assertEq(cash.allowance(d.settler, d.tradeRouter), 0); assertEq(token.allowance(d.settler, d.tradeRouter), 0);
    }

    function _authSig(address asset, IX402Settler.Authorization memory a) private view returns (bytes memory) {
        return _sig(102, keccak256(abi.encodePacked(hex"1901", IERC3009(asset).DOMAIN_SEPARATOR(), keccak256(abi.encode(
            IERC3009(asset).TRANSFER_WITH_AUTHORIZATION_TYPEHASH(), a.from, a.to, a.value, a.validAfter, a.validBefore, a.nonce)))));
    }

    function _sig(uint256 key, bytes32 digest) private pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }
}
