// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {FixedPointMathLib as Math} from "solady/utils/FixedPointMathLib.sol";

/// @notice Monetary results round half up to micro USDC, except pro rata claim rates which floor.
library FeeMath {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant FEE_BPS = 130;
    uint256 internal constant HOST_BPS = 100;
    uint256 internal constant PLATFORM_BPS = 20;
    uint256 internal constant COVER_BPS = 10;
    uint256 internal constant LATE_MAX_BPS = 3000;
    uint256 internal constant RECALL_MARKUP = 0.25e18;
    uint256 internal constant RECALL_MIN_MARKUP = 0.05e18;

    struct Split {
        uint256 total;
        uint256 host;
        uint256 platform;
        uint256 cover;
        uint256 rebate;
    }
    error InvalidRate();

    function halfUp(uint256 x, uint256 y, uint256 denominator) internal pure returns (uint256 result) {
        result = FullMath.mulDiv(x, y, denominator);
        if (mulmod(x, y, denominator) >= denominator / 2 + denominator % 2) result++;
    }

    /// @notice Rate is WAD, with second precision and no early rounding to integral bps.
    function lateFee(int256 secondsLeft) internal pure returns (uint256) {
        if (secondsLeft >= 72 hours) return 0.013e18;
        if (secondsLeft <= 0) return 0.3e18;
        return 0.013e18 + FullMath.mulDiv(0.287e18, uint256(int256(72 hours) - secondsLeft), 72 hours);
    }

    /// @notice Total is authoritative. Tiny component rounding residual goes to platform.
    /// @dev Host and cover are capped to the remaining total to conserve every micro USDC.
    function split(uint256 notional, uint256 rate, bool hostSelfTrade) internal pure returns (Split memory s) {
        if (rate < 0.013e18 || rate > 0.3e18) revert InvalidRate();
        s.total = halfUp(notional, rate, WAD);
        uint256 base = halfUp(notional, FEE_BPS, 10000);
        s.host = Math.min(halfUp(notional, HOST_BPS, 10000), base);
        s.cover = Math.min(halfUp(notional, COVER_BPS, 10000), base - s.host);
        s.platform = base - s.host - s.cover;
        s.rebate = s.total - base;
        if (hostSelfTrade) {
            s.rebate += s.host;
            s.host = 0;
        }
    }

    function makerRebate(uint256 askPrice, uint256 poolPrice, uint256 qty, uint256 available)
        internal
        pure
        returns (uint256)
    {
        if (askPrice > FullMath.mulDiv(poolPrice, 105, 100)) return 0;
        return Math.min(available, halfUp(askPrice, qty, 200e18));
    }

    /// @notice Uses actual held reserve, not the ideal curve. Rate floors to keep claims solvent.
    function cutoffRefund(uint256 reserve, uint256 held)
        internal
        pure
        returns (uint256 total, uint256 haircut, uint256 perNight)
    {
        if (held == 0) return (0, 0, 0);
        haircut = halfUp(reserve, 3000, 10000);
        total = reserve - haircut;
        perNight = FullMath.mulDiv(total, WAD, held);
    }

    function recallStrike(uint256 F, uint256 k, uint256 markup) internal pure returns (uint256) {
        if (markup < RECALL_MIN_MARKUP || k > 100e18) revert InvalidRate();
        uint256 topWad = F * uint256(Math.expWad(int256(k)));
        return halfUp(topWad, WAD + markup, 1e36);
    }

    function capOf(uint256 S) internal pure returns (uint256) {
        return Math.max(WAD, FullMath.mulDiv(S, 3, 10));
    }

    /// @notice Only the fund advance becomes debt. Insufficient fund liquidity must revert atomically.
    function walkPayout(uint256 paid, uint256 pending)
        internal
        pure
        returns (uint256 fromPending, uint256 fromFund, uint256 hostDebt)
    {
        fromPending = Math.min(paid, pending);
        fromFund = paid - fromPending;
        hostDebt = fromFund;
    }
}
