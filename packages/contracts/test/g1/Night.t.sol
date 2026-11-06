// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Test} from "forge-std/Test.sol";
import {NightFactory} from "../../src/NightFactory.sol";
import {NightToken} from "../../src/NightToken.sol";
import {INightTypes} from "../../src/interfaces/INightTypes.sol";
import {INightToken} from "../../src/interfaces/INightToken.sol";
import {INightFactory} from "../../src/interfaces/INightFactory.sol";
import {OrderLib} from "../../src/libraries/OrderLib.sol";
import {PoolManager} from "v4-core/src/PoolManager.sol";
import {RegistryDouble, SettlementDouble, HookDouble, VaultDouble} from "../doubles/g1/Peers.sol";
import {MockUSDC} from "../mocks/MockUSDC.sol";

contract NightTest is Test, INightTypes {
    NightFactory f;
    NightToken t;
    RegistryDouble registry;
    SettlementDouble settlement;
    VaultDouble vault;
    MockUSDC usdc;
    PoolManager manager;
    address constant HOST = address(0x888);
    address constant BOOK = address(0x777);
    address constant TRADE = address(0x666);
    address constant HOOK = address(0x12aec);
    address constant A = address(0x100);
    address constant B = address(0x200);
    bytes32 id;
    NightConfig c;

    function setUp() public {
        vm.warp(1_800_000_000);
        manager = new PoolManager(address(this));
        registry = new RegistryDouble();
        settlement = new SettlementDouble(vm.addr(123));
        vault = new VaultDouble();
        usdc = new MockUSDC();
        vm.etch(HOOK, address(new HookDouble()).code);
        Deployment memory d = Deployment(
            address(manager),
            address(usdc),
            address(0x999),
            address(vault),
            HOOK,
            BOOK,
            TRADE,
            address(settlement),
            address(0x111),
            address(0x222),
            address(registry),
            address(0x333)
        );
        f = new NightFactory(d);
        vault.setup(f, manager);
        registry.set(HOST, 1, true);
        registry.set(A, 2, true);
        registry.set(B, 3, true);
        _bind();
        id = f.registerNightIdentity("hotel", "double", "2030-01-01");
        (bytes32 property, bytes32 room, uint64 checkIn) = f.identities(id);
        c = NightConfig(6000e6, 1.2e18, 15e18, 0, uint64(block.timestamp + 7 days), HOST, property, room, id, checkIn);
    }

    function _bind() internal {
        uint64 deadline = uint64(block.timestamp + 1 days);
        bytes32 digest = OrderLib.digest(
            f.DOMAIN_SEPARATOR(), OrderLib.hashProperty(keccak256("hotel"), HOST, deadline)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(123, digest);
        f.bindProperty(keccak256("hotel"), HOST, deadline, abi.encodePacked(r, s, v));
    }

    function _salt() internal view returns (bytes32 salt) {
        for (uint256 i;; i++) {
            salt = bytes32(i);
            if (f.predictToken(c, salt) < address(usdc)) return salt;
        }
    }

    function _open() internal {
        bytes32 salt = _salt();
        vm.prank(HOST);
        (, address token) = f.openNight(c, salt);
        t = NightToken(token);
    }

    function _give(address to, uint256 n) internal {
        vm.prank(address(vault));
        t.transfer(to, n);
    }

    function _hint(address who, address p, address n) internal {
        Hint[] memory h = new Hint[](1);
        h[0] = Hint(who, p, n);
        t.setHints(h);
    }

    function testCanonicalOpeningAndChunks() public {
        bytes32 salt = _salt();
        address predicted = f.predictToken(c, salt);
        vm.prank(HOST);
        (, address token) = f.openNight("hotel", "double", "2030-01-01", c, salt);
        t = NightToken(token);
        assertEq(token, predicted);
        assertEq(t.night(), id);
        assertEq(t.decimals(), 18);
        assertGt(t.totalSupply(), c.S);
        assertEq(t.totalSupply(), c.S + t.dustMinted());
        assertEq(t.balanceOf(address(vault)), t.totalSupply());
        assertFalse(f.ladderComplete(id));
        vm.prank(HOST);
        f.addLadderChunk(id, 0, 5);
        vm.expectRevert(InvalidChunk.selector);
        vm.prank(HOST);
        f.addLadderChunk(id, 0, 15);
        vm.expectRevert(Unauthorized.selector);
        f.addLadderChunk(id, 5, 15);
        vm.prank(HOST);
        f.addLadderChunk(id, 5, 15);
        assertTrue(f.ladderComplete(id));
        vm.expectRevert(InvalidChunk.selector);
        vm.prank(HOST);
        f.addLadderChunk(id, 15, 15);
        vm.expectRevert(abi.encodeWithSelector(AlreadyOpened.selector, id));
        vm.prank(HOST);
        f.openNight(c, salt);
        vm.expectRevert(INightToken.AlreadyInitialized.selector);
        vm.prank(address(f));
        t.initialize(id);
        vm.expectRevert(Unauthorized.selector);
        t.initialize(id);
    }

    function testBindingFailures() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        bytes32 digest = OrderLib.digest(
            f.DOMAIN_SEPARATOR(), OrderLib.hashProperty(keccak256("hotel"), HOST, deadline)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(123, digest);
        vm.expectRevert(InvalidSignature.selector);
        f.bindProperty(keccak256("hotel"), HOST, deadline, abi.encodePacked(r, s, v));
        vm.expectRevert(Expired.selector);
        f.bindProperty(bytes32(uint256(7)), HOST, 0, "");
        vm.expectRevert(InvalidConfig.selector);
        f.bindProperty(bytes32(uint256(7)), address(0), uint64(block.timestamp), "");
        vm.expectRevert(InvalidSignature.selector);
        f.bindProperty(bytes32(uint256(7)), HOST, uint64(block.timestamp), "");
        assertEq(f.ownerOf(keccak256("hotel")), HOST);
    }

    function testOpeningFailures() public {
        bytes32 salt = _salt();
        vm.expectRevert(Unauthorized.selector);
        f.openNight(c, salt);
        registry.set(HOST, 1, false);
        vm.expectRevert(Unauthorized.selector);
        vm.prank(HOST);
        f.openNight(c, salt);
        registry.set(HOST, 1, true);
        settlement.setIncidents(HOST, 2);
        vm.expectRevert(abi.encodeWithSelector(HostSuspended.selector, HOST));
        vm.prank(HOST);
        f.openNight(c, salt);
        settlement.setIncidents(HOST, 0);
        c.S = 101e18;
        vm.expectRevert(InvalidConfig.selector);
        vm.prank(HOST);
        f.openNight(c, salt);
        c.S = 1e17;
        vm.expectRevert(InvalidConfig.selector);
        vm.prank(HOST);
        f.openNight(c, salt);
        c.S = 15e18;
        c.cutoff = uint64(block.timestamp);
        vm.expectRevert(CutoffReached.selector);
        vm.prank(HOST);
        f.openNight(c, salt);
        vm.expectRevert(InvalidConfig.selector);
        f.registerNightIdentity("ho:tel", "double", "2030-01-01");
        vm.expectRevert(InvalidConfig.selector);
        f.registerNightIdentity("hotel", "double", "2030-02-29");
        vm.expectRevert(abi.encodeWithSelector(UnknownNight.selector, bytes32(0)));
        f.config(bytes32(0));
    }

    function testCapsRelinkListAndAllowance() public {
        _open();
        _give(A, 3e18);
        _give(B, 1e18);
        assertEq(t.head(), A);
        assertEq(t.next(A), B);
        assertEq(t.prev(B), A);
        registry.set(B, 2, true); // Existing B holdings keep human 3.
        _give(B, 1e18);
        assertEq(t.humanBalance(3), 2e18);
        assertEq(t.cachedHuman(B), 3);
        vm.prank(A);
        t.approve(address(this), 1e18);
        t.transferFrom(A, B, 1e18);
        assertEq(t.head(), B);
        assertEq(t.allowance(A, address(this)), 0);
        vm.expectRevert(NightToken.InsufficientAllowance.selector);
        t.transferFrom(A, B, 1e17);
        vm.expectRevert(abi.encodeWithSelector(INightToken.CapExceeded.selector, 2, 5e18, 4.5e18));
        vm.prank(B);
        t.transfer(A, 3e18);
        vm.prank(B);
        t.transfer(address(vault), 3e18);
        assertEq(t.cachedHuman(B), 0);
        _give(B, 1e18);
        assertEq(t.cachedHuman(B), 2);
    }

    function testCapAndGranularityReverts() public {
        _open();
        _give(A, 4e18);
        registry.set(B, 2, true);
        vm.expectRevert(abi.encodeWithSelector(INightToken.CapExceeded.selector, 2, 5e18, 4.5e18));
        _give(B, 1e18);
        vm.expectRevert(InvalidQuantity.selector);
        _give(A, 1);
        vm.expectRevert(abi.encodeWithSelector(INightToken.UnverifiedHuman.selector, address(0x444)));
        _give(address(0x444), 1e17);
        vm.expectRevert(NightToken.ZeroAddress.selector);
        vm.prank(A);
        t.transfer(address(0), 1e17);
        vm.expectRevert(NightToken.InsufficientBalance.selector);
        vm.prank(B);
        t.transfer(A, 1e17);
    }

    function testRoutersRecallAndBurn() public {
        _open();
        _give(A, 2e18);
        _give(B, 1e18);
        vm.expectRevert(Unauthorized.selector);
        t.routerTransfer(A, B, 1e17);
        vm.prank(TRADE);
        t.routerTransfer(A, B, 1e17);
        assertEq(t.balanceOf(B), 1.1e18);
        vm.expectRevert(Unauthorized.selector);
        t.recall(1e18, B);
        vm.expectRevert(Unauthorized.selector);
        t.burn(1e18);
        vm.expectRevert(InvalidQuantity.selector);
        vm.prank(BOOK);
        t.recall(1, B);
        usdc.mint(address(t), t.X() * 10);
        uint256 gross = t.X();
        vm.prank(BOOK);
        assertEq(t.recall(1e18, B), gross);
        assertEq(t.balanceOf(A), 0.9e18);
        assertEq(usdc.balanceOf(A), gross - (gross * 130 + 5000) / 10000);
        vm.prank(BOOK);
        t.burn(1e18);
        assertEq(t.burned(), 1e18);
        assertEq(t.released(), 2e18);
    }

    function testCutoffSnapshotAndDust() public {
        _open();
        _give(A, 1e18);
        _give(B, 2e18);
        vm.expectRevert(Unauthorized.selector);
        t.collectAllAtCutoff();
        vm.expectRevert(BeforeCutoff.selector);
        vm.prank(address(settlement));
        t.collectAllAtCutoff();
        vm.expectRevert(BeforeCutoff.selector);
        vm.prank(address(settlement));
        t.burnVaultDust();
        vm.warp(c.cutoff);
        vm.expectRevert(CutoffReached.selector);
        vm.prank(A);
        t.transfer(B, 1e17);
        vm.prank(address(settlement));
        assertEq(t.collectAllAtCutoff(), 3e18);
        assertEq(t.balanceOf(A), 0);
        assertEq(t.snapshotBalance(A), 1e18);
        assertEq(t.head(), B);
        assertEq(t.next(B), A);
        assertEq(t.balanceOf(address(settlement)), 3e18);
        assertEq(t.released(), 0);
        vm.prank(address(settlement));
        t.burnVaultDust();
        assertEq(t.balanceOf(address(vault)), 0);
        assertEq(t.burned(), 0);
        vm.prank(address(settlement));
        t.burn(3e18);
        assertEq(t.totalSupply(), 0);
    }

    function _ladderGas(uint256 rooms) internal {
        c.S = rooms * 1e18;
        bytes32 salt = _salt();
        uint256 start = gasleft();
        vm.prank(HOST);
        (, address token) = f.openNight(c, salt);
        t = NightToken(token);
        emit log_named_uint("openNight gas", start - gasleft());
        start = gasleft();
        for (uint256 i; i < rooms; i += 10) {
            vm.prank(HOST);
            f.addLadderChunk(id, i, i + 10 > rooms ? rooms : i + 10);
        }
        emit log_named_uint("full ladder gas (10-room chunks)", start - gasleft());
        usdc.mint(address(vault), 1e15);
        for (uint256 i; i < rooms * 10; i++) {
            address user = address(uint160(0x10000 + rooms * 10 - i));
            registry.set(user, i + 100, true);
            vault.buy(id, user);
        }
        assertEq(t.released(), rooms * 1e18);
        assertEq(t.holderCount(), rooms * 10);
        vm.expectRevert(SoldOut.selector);
        vm.prank(address(manager));
        t.transfer(TRADE, 1);
    }

    function testGasAndFullSellout15() public {
        _ladderGas(15);
    }

    function testGasAndFullSellout100() public {
        _ladderGas(100);
    }

    function testThousandHoldersAndBoundedHints() public {
        c.S = 100e18;
        _open();
        for (uint256 i; i < 1000; i++) {
            address who = address(uint160(0x10000 + i * 2));
            registry.set(who, i + 10, true);
            if (i != 0) _hint(who, address(uint160(0x10000 + (i - 1) * 2)), address(0));
            _give(who, 1e17);
        }
        assertEq(t.holderCount(), 1000);
        address last = address(uint160(0x10000 + 999 * 2));
        address newcomer = address(0x20000);
        registry.set(newcomer, 2000, true);
        vm.expectRevert(INightToken.HintSearchExhausted.selector);
        vm.prank(last);
        t.transfer(newcomer, 1e17);
        _hint(newcomer, address(uint160(0x10000 + 998 * 2)), address(0));
        uint256 start = gasleft();
        vm.prank(last);
        t.transfer(newcomer, 1e17);
        emit log_named_uint("1000-holder hinted tail replacement gas", start - gasleft());
        assertEq(t.holderCount(), 1000);
        address middle = address(uint160(0x10000 + 127));
        registry.set(middle, 2001, true);
        start = gasleft();
        vm.prank(newcomer);
        t.transfer(middle, 1e17);
        emit log_named_uint("1000-holder 64-step fallback insertion gas", start - gasleft());
        assertEq(t.prev(middle), address(uint160(0x10000 + 126)));
    }

    function testLegacyCollectionAndAccessReverts() public {
        _open();
        _give(A, 2e18);
        vm.expectRevert(Unauthorized.selector);
        t.collectAtCutoff(A, 1e18);
        vm.expectRevert(Unauthorized.selector);
        t.burnVaultDust();
        vm.expectRevert(BeforeCutoff.selector);
        vm.prank(address(settlement));
        t.collectAtCutoff(A, 1e18);
        vm.expectRevert(InvalidQuantity.selector);
        vm.prank(BOOK);
        t.burn(1);
        vm.expectRevert(NightToken.InsufficientBalance.selector);
        vm.prank(BOOK);
        t.burn(1e18);
        vm.prank(BOOK);
        t.routerTransfer(A, BOOK, 1e18);
        vm.warp(c.cutoff);
        vm.expectRevert(CutoffReached.selector);
        vm.prank(BOOK);
        t.burn(1e18);
        vm.expectRevert(CutoffReached.selector);
        vm.prank(BOOK);
        t.recall(1e18, B);
        vm.expectRevert(CutoffReached.selector);
        vm.prank(HOST);
        f.addLadderChunk(id, 0, 1);
        vm.expectRevert(InvalidQuantity.selector);
        vm.prank(address(settlement));
        t.collectAtCutoff(address(vault), 1e18);
        vm.prank(address(settlement));
        t.collectAtCutoff(A, 1e18);
        assertEq(t.holderCount(), 0);
        assertEq(t.humanBalance(2), 0);
    }

    function testRecallAtomicFailureAndLargestTie() public {
        _open();
        _give(B, 1e18);
        _give(A, 1e18);
        assertEq(t.head(), A);
        vm.expectRevert();
        vm.prank(BOOK);
        t.recall(1e18, B);
        assertEq(t.balanceOf(A), 1e18);
        assertEq(t.head(), A);
        usdc.mint(address(t), t.X() * 3);
        vm.expectRevert(SoldOut.selector);
        vm.prank(BOOK);
        t.recall(3e18, B);
        assertEq(t.balanceOf(A), 1e18);
        assertEq(usdc.balanceOf(A), 0);
        vm.prank(BOOK);
        t.recall(2e18, B);
        assertEq(t.head(), address(0));
        assertEq(t.holderCount(), 0);
    }

    function testZeroSelfTransferInfiniteAllowanceAndBadHints() public {
        _open();
        _give(A, 1e18);
        _give(B, 1e18);
        vm.prank(A);
        t.transfer(A, 1e18);
        assertEq(t.holderCount(), 2);
        vm.prank(A);
        t.transfer(B, 0);
        assertEq(t.humanBalance(2), 1e18);
        _hint(B, B, A);
        vm.prank(A);
        t.approve(address(this), type(uint256).max);
        t.transferFrom(A, B, 1e17);
        assertEq(t.head(), B);
        assertEq(t.allowance(A, address(this)), type(uint256).max);
    }

    function testIdentityAndSaltValidation() public {
        bytes32 salt = _salt();
        c.checkIn++;
        vm.expectRevert(InvalidConfig.selector);
        vm.prank(HOST);
        f.openNight(c, salt);
        c.checkIn--;
        for (uint256 i;; i++) {
            salt = bytes32(i);
            if (f.predictToken(c, salt) >= address(usdc)) break;
        }
        vm.expectRevert(INightFactory.InvalidTokenOrder.selector);
        vm.prank(HOST);
        f.openNight(c, salt);
        vm.expectRevert(InvalidConfig.selector);
        f.registerNightIdentity("hotel", "", "2030-01-01");
        vm.expectRevert(InvalidConfig.selector);
        f.registerNightIdentity("hotel", "double", "2030-13-01");
        vm.expectRevert(InvalidConfig.selector);
        f.registerNightIdentity("hotel", "double", "xxxx-01-01");
        bytes32 epoch = f.registerNightIdentity("hotel", "double", "1970-01-01");
        (,, uint64 checkIn) = f.identities(epoch);
        assertEq(checkIn, 15 hours);
        f.registerNightIdentity("hotel", "double", "2028-02-29");
    }

    function testCutoffRemainderAndRepeatedSnapshot() public {
        _open();
        uint256 dust = t.dustMinted();
        vm.expectRevert(Unauthorized.selector);
        t.burnCutoffRemainder();
        vm.expectRevert(BeforeCutoff.selector);
        vm.prank(address(settlement));
        t.burnCutoffRemainder();
        vm.prank(address(vault));
        t.transfer(address(settlement), dust);
        vm.warp(c.cutoff);
        vm.prank(address(settlement));
        assertEq(t.burnCutoffRemainder(), dust);
        assertEq(t.burned(), 0);
        assertEq(t.totalSupply(), c.S);
        vm.prank(address(settlement));
        assertEq(t.collectAllAtCutoff(), 0);
        vm.expectRevert(INightToken.AlreadyInitialized.selector);
        vm.prank(address(settlement));
        t.collectAllAtCutoff();
        vm.expectRevert(CutoffReached.selector);
        vm.prank(address(settlement));
        t.transfer(A, 0);
    }
    function testRecallReentrancyRollsBack() public {
        _open(); _give(A,1e18); usdc.mint(address(t),t.X());
        HookDouble(HOOK).setAttack(true);
        vm.expectRevert(Reentrancy.selector); vm.prank(BOOK); t.recall(1e18,B);
        assertEq(t.balanceOf(A),1e18); assertEq(t.balanceOf(BOOK),0);
        assertEq(usdc.balanceOf(HOOK),0); assertEq(t.head(),A);
    }
    function testDeploymentValidationAndSmallCap() public {
        Deployment memory deps=f.dependencies(); deps.usdc=address(0);
        vm.expectRevert(InvalidConfig.selector); new NightFactory(deps);
        deps=f.dependencies(); deps.hook=address(0x1234);
        vm.expectRevert(InvalidConfig.selector); new NightFactory(deps);
        c.S=1e18; _open(); assertEq(t.cap(),1e18); assertEq(t.name(),"NightShares Room Night"); assertEq(t.symbol(),"NIGHT");
        assertEq(f.MAX_S(),100e18); assertGt(f.config(id).X,c.F);
        assertTrue(t.excluded(BOOK)); assertFalse(t.excluded(A));
    }

}
