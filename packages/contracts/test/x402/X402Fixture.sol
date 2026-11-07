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
abstract contract X402Fixture is Test, INightTypes {
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

    function setUp() public virtual {
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

}
