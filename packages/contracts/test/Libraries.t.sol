// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Test} from "forge-std/Test.sol";
import {LadderMath} from "../src/libraries/LadderMath.sol";
import {FeeMath} from "../src/libraries/FeeMath.sol";
import {NightKeyLib} from "../src/libraries/NightKeyLib.sol";
import {OrderLib} from "../src/libraries/OrderLib.sol";
import {INightTypes} from "../src/interfaces/INightTypes.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {SqrtPriceMath} from "v4-core/src/libraries/SqrtPriceMath.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {FixedPointMathLib as Math} from "solady/utils/FixedPointMathLib.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract LibrariesTest is Test {
    uint256 constant F = 6000e6;
    uint256 constant K = 1.2e18;
    uint256 constant S = 15e18;

    function roomCost(uint256 i) internal pure returns (uint256) {
        (int24 lo, int24 hi, uint128 L) = LadderMath.room(F, K, S, i);
        return SqrtPriceMath.getAmount1Delta(TickMath.getSqrtPriceAtTick(lo), TickMath.getSqrtPriceAtTick(hi), L, true);
    }

    function testMarketModelGoldenLadder() public pure {
        // Market-model has no tick quantization. Compare each room against its geometric mean.
        uint256 total;
        for (uint256 i; i < 15; ++i) {
            uint256 actual = roomCost(i);
            uint256 idealLadder = F * uint256(Math.expWad(int256(K * (2 * i + 1) / 30))) / 1e18;
            assertApproxEqRel(actual, idealLadder, 0.0003e18);
            total += actual;
        }
        assertApproxEqRel(roomCost(6), 10092165_898, 0.0003e18);
        assertApproxEqRel(total, 173962e6, 0.0003e18);
        // Ideal continuous exponential differs from the one-room ladder by about 0.0267%.
        uint256 continuous = F * (uint256(Math.expWad(int256(K))) - 1e18) * 15 / K;
        assertApproxEqAbs(continuous, 174009e6, 1e6);
    }

    function testCutoffGolden() public pure {
        uint256 reserve;
        for (uint256 i = 2; i < 6; ++i) {
            reserve += roomCost(i);
        }
        (uint256 total, uint256 haircut, uint256 perNight) = FeeMath.cutoffRefund(reserve, 4e18);
        // Current market-model ladder: 33183.415221; SPECS rounded continuous example: 33192.
        assertApproxEqRel(reserve, 33183415_221, 0.0003e18);
        assertApproxEqAbs(reserve, 33192e6, 12e6);
        assertApproxEqAbs(perNight, 5809e6, 3e6);
        assertApproxEqAbs(haircut, 9958e6, 4e6);
        assertEq(total + haircut, reserve);
    }

    function testDecimalConversionAndTickFloor() public pure {
        assertEq(LadderMath.sqrtPriceX96(1e36), 1 << 96);
        for (uint256 i; i <= 15; ++i) {
            uint160 ideal = LadderMath.sqrtPriceX96(LadderMath.priceWad(F, K, S, i * 1e18));
            int24 tick = LadderMath.boundaryTick(F, K, S, i * 1e18);
            assertLe(TickMath.getSqrtPriceAtTick(tick), ideal);
            assertGt(TickMath.getSqrtPriceAtTick(tick + 1), ideal);
        }
        // 6000 USDC per token becomes 6e-9 raw USDC per raw NightToken.
        uint160 root = LadderMath.sqrtPriceX96(6000e24);
        assertApproxEqRel(FullMath.mulDiv(root, root, 1 << 96), FullMath.mulDiv(6, 1 << 96, 1e9), 1e9);
    }

    function testLadderLiquidityRoundingDust() public pure {
        uint256 deposited;
        uint256 poolOutput;
        for (uint256 i; i < 15; ++i) {
            (int24 lo, int24 hi, uint128 L) = LadderMath.room(F, K, S, i);
            uint160 a = TickMath.getSqrtPriceAtTick(lo);
            uint160 b = TickMath.getSqrtPriceAtTick(hi);
            uint256 amount = SqrtPriceMath.getAmount0Delta(a, b, L, true);
            assertLe(amount, 1e18);
            assertLt(1e18 - amount, 1e9);
            deposited += amount;
            poolOutput += SqrtPriceMath.getAmount0Delta(a, b, L, false);
        }
        assertLt(poolOutput, S);
        // Integer liquidity cannot encode exactly one whole token in each position.
        assertLe(deposited, S);
        assertLt(S - deposited, 1e10);
    }

    function testFeesGoldenAndConservation() public pure {
        assertEq(FeeMath.lateFee(72 hours), 0.013e18);
        assertEq(FeeMath.lateFee(100 hours), 0.013e18);
        assertEq(FeeMath.lateFee(36 hours), 0.1565e18);
        assertEq(FeeMath.lateFee(0), 0.3e18);
        assertEq(FeeMath.lateFee(-1), 0.3e18);
        FeeMath.Split memory s = FeeMath.split(100e6, 0.1565e18, false);
        assertEq(s.total, 15650000);
        assertEq(s.host, 1e6);
        assertEq(s.platform, 200000);
        assertEq(s.cover, 100000);
        assertEq(s.rebate, 14350000);
        s = FeeMath.split(100e6, 0.013e18, true);
        assertEq(s.host, 0);
        assertEq(s.rebate, 1e6);
        assertEq(FeeMath.halfUp(1, 1, 2), 1);
        assertEq(FeeMath.halfUp(1, 1, 3), 0);
        assertEq(FeeMath.halfUp(1, 2, 3), 1);
    }

    function testFuzzFeeConservation(uint128 notional, uint32 secondsLeft, bool self) public pure {
        FeeMath.Split memory s = FeeMath.split(notional, FeeMath.lateFee(int256(uint256(secondsLeft))), self);
        assertEq(s.total, s.host + s.platform + s.cover + s.rebate);
    }

    function testMakerRebate() public pure {
        assertEq(FeeMath.makerRebate(105e6, 100e6, 1e18, 1e6), 525000);
        assertEq(FeeMath.makerRebate(105e6 + 1, 100e6, 1e18, 1e6), 0);
        assertEq(FeeMath.makerRebate(100e6, 100e6, 1e18, 123), 123);
        assertEq(FeeMath.makerRebate(100e6, 100e6, 1e18, 0), 0);
    }

    function testRecallCapAndWalk() public pure {
        assertApproxEqAbs(FeeMath.recallStrike(F, K, 0.25e18), 24900876_921, 1);
        assertEq(FeeMath.capOf(15e18), 4.5e18);
        assertEq(FeeMath.capOf(1e18), 1e18);
        (uint256 pending, uint256 fund, uint256 debt) = FeeMath.walkPayout(100e6, 40e6);
        assertEq(pending, 40e6);
        assertEq(fund, 60e6);
        assertEq(debt, fund);
        (pending, fund, debt) = FeeMath.walkPayout(100e6, 150e6);
        assertEq(pending, 100e6);
        assertEq(fund, 0);
        assertEq(debt, 0);
        (uint256 total, uint256 haircut, uint256 perNight) = FeeMath.cutoffRefund(0, 0);
        assertEq(total + haircut + perNight, 0);
    }

    function badCurve(uint256 k, uint256 S_) external pure {
        LadderMath.room(F, k, S_, 0);
    }

    function badMarkup() external pure {
        FeeMath.recallStrike(F, K, 0.049e18);
    }

    function testInvalidInputs() public {
        vm.expectRevert(LadderMath.InvalidCurve.selector);
        this.badCurve(0, S);
        vm.expectRevert(LadderMath.InvalidCurve.selector);
        this.badCurve(K, 1.5e18);
        vm.expectRevert(LadderMath.InvalidCurve.selector);
        this.badCurve(K, 101e18);
        vm.expectRevert(LadderMath.InvalidRange.selector);
        this.badCurve(1, S);
        vm.expectRevert(FeeMath.InvalidRate.selector);
        this.badMarkup();
    }

    function testNightKeyAndTypedData() public pure {
        bytes32 property = NightKeyLib.property("hotel");
        assertEq(property, keccak256(bytes("hotel")));
        bytes32 night = NightKeyLib.night("hotel", "double", "2026-11-07");
        assertEq(night, keccak256(bytes("hotel:double:2026-11-07")));
        assertNotEq(night, NightKeyLib.night("hotel", "double", "2026-11-08"));
        INightTypes.Order memory o = INightTypes.Order(night, 1e18, 6000e6, 1234, 2, address(3));
        bytes32 expected = keccak256(
            abi.encode(
                keccak256("Order(bytes32 night,uint256 size,uint256 price,uint64 expiry,uint256 nonce,address maker)"),
                night,
                uint256(1e18),
                uint256(6000e6),
                uint64(1234),
                uint256(2),
                address(3)
            )
        );
        assertEq(OrderLib.hash(o), expected);
        bytes32 domain = OrderLib.domainSeparator(5042002, address(4));
        assertEq(
            domain,
            keccak256(
                abi.encode(
                    keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                    keccak256("NightShares"),
                    keccak256("1"),
                    uint256(5042002),
                    address(4)
                )
            )
        );
        assertEq(OrderLib.digest(domain, expected), keccak256(abi.encodePacked(hex"1901", domain, expected)));
        assertNotEq(domain, OrderLib.domainSeparator(5042002, address(5)));
        assertNotEq(domain, OrderLib.domainSeparator(5042, address(4)));
        INightTypes.WalkAttestation memory w = INightTypes.WalkAttestation(
            bytes32(uint256(1)), bytes32(uint256(2)), property, address(3), 100e6, bytes32(uint256(4)), 123, 456
        );
        assertEq(
            OrderLib.hash(w),
            keccak256(
                abi.encode(
                    keccak256(
                        "WalkAttestation(bytes32 reportId,bytes32 bookingId,bytes32 property,address guest,uint256 paid,bytes32 evidenceHash,uint64 reportedAt,uint64 deadline)"
                    ),
                    w.reportId,
                    w.bookingId,
                    w.property,
                    w.guest,
                    w.paid,
                    w.evidenceHash,
                    w.reportedAt,
                    w.deadline
                )
            )
        );
    }

    function testAskGrossRoundingAndSeparateFees() public pure {
        assertEq(OrderLib.fillCost(1e17, 11), 2);
        assertEq(OrderLib.fillCost(1e18, 6000e6), 6000e6);
        assertEq(OrderLib.fillCost(1e17, 10), 1);
        uint256 gross = OrderLib.fillCost(3e17, 123456789);
        FeeMath.Split memory fees = FeeMath.split(gross, 0.013e18, false);
        assertEq(gross, 37037037);
        assertEq(fees.total, 481481);
        assertEq(gross + fees.total, 37518518);
    }

    function testAttestationTypeSeparation() public pure {
        bytes32 linked = OrderLib.hashWallet(123, address(7), 456, false);
        assertEq(
            linked,
            keccak256(
                abi.encode(
                    keccak256("LinkWallet(uint256 humanId,address wallet,uint64 deadline)"),
                    uint256(123),
                    address(7),
                    uint64(456)
                )
            )
        );
        assertNotEq(linked, OrderLib.hashWallet(123, address(7), 456, true));
        assertEq(
            OrderLib.hashProperty(bytes32(uint256(1)), address(7), 456),
            keccak256(
                abi.encode(
                    keccak256("BindProperty(bytes32 property,address hostPayout,uint64 deadline)"),
                    bytes32(uint256(1)),
                    address(7),
                    uint64(456)
                )
            )
        );
    }

    function testMaxLadderTokenBudget() public pure {
        uint256 deposited;
        for (uint256 i; i < 100; ++i) {
            (int24 lo, int24 hi, uint128 L) = LadderMath.room(F, K, 100e18, i);
            uint256 amount = SqrtPriceMath.getAmount0Delta(
                TickMath.getSqrtPriceAtTick(lo), TickMath.getSqrtPriceAtTick(hi), L, true
            );
            assertLe(amount, 1e18);
            assertApproxEqAbs(amount, 1e18, 1e9);
            deposited += amount;
        }
        assertLe(deposited, 100e18);
    }

    function testEtchedUSDC() public {
        address usdc = 0x3600000000000000000000000000000000000000;
        MockUSDC implementation = new MockUSDC();
        vm.etch(usdc, address(implementation).code);
        MockUSDC token = MockUSDC(usdc);
        assertEq(token.decimals(), 6);
        token.mint(address(this), 10e6);
        token.approve(address(1), 4e6);
        vm.prank(address(1));
        token.transferFrom(address(this), address(2), 4e6);
        assertEq(token.balanceOf(address(2)), 4e6);
        assertEq(token.totalSupply(), 10e6);
        assertEq(token.allowance(address(this), address(1)), 0);
    }
}
