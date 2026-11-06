// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {FixedPointMathLib as Math} from "solady/utils/FixedPointMathLib.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";

/// @notice Standard v4 ladder math for currency0 NightToken (18) and currency1 USDC (6).
library LadderMath {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant MAX_S = 100e18;
    uint256 internal constant Q96 = 1 << 96;
    int24 internal constant TICK_SPACING = 1;
    error InvalidCurve();
    error InvalidRange();

    /// @notice Returns micro USDC per whole room, scaled by 1e18. F is unscaled micro USDC.
    function priceWad(uint256 F, uint256 k, uint256 S, uint256 q) internal pure returns (uint256) {
        if (F == 0 || S == 0 || S > MAX_S || S % WAD != 0 || q > S || k == 0 || k > 100e18) revert InvalidCurve();
        return F * uint256(Math.expWad(int256(FullMath.mulDiv(k, q, S))));
    }

    /// @notice Floors sqrt(raw USDC / raw NightToken) * 2^96.
    /// @dev priceWad / 1e36 is the raw currency ratio. Integer sqrt and division round down.
    function sqrtPriceX96(uint256 price) internal pure returns (uint160) {
        uint256 ratioX192 = FullMath.mulDiv(price, 1 << 192, 1e36);
        uint256 root = Math.sqrt(ratioX192);
        if (root < TickMath.MIN_SQRT_PRICE || root >= TickMath.MAX_SQRT_PRICE) revert InvalidRange();
        return uint160(root);
    }

    /// @notice Every boundary rounds toward negative infinity to the greatest tick whose price is <= ideal.
    function boundaryTick(uint256 F, uint256 k, uint256 S, uint256 q) internal pure returns (int24) {
        return TickMath.getTickAtSqrtPrice(sqrtPriceX96(priceWad(F, k, S, q)));
    }

    /// @notice Floors L = amount0 * sqrtA * sqrtB / (2^96 * (sqrtB - sqrtA)).
    /// @dev Mirrors the standard v4 amount0 liquidity formula, including its intermediate floor.
    function liquidity(uint160 sqrtA, uint160 sqrtB, uint256 amount0) internal pure returns (uint128) {
        if (sqrtA == 0 || sqrtB <= sqrtA || amount0 == 0) revert InvalidRange();
        uint256 intermediate = FullMath.mulDiv(sqrtA, sqrtB, Q96);
        uint256 result = FullMath.mulDiv(amount0, intermediate, uint256(sqrtB) - sqrtA);
        if (result == 0 || result > uint256(uint128(type(int128).max))) revert InvalidRange();
        return uint128(result);
    }

    /// @notice Room i is zero based. Adjacent collapsed ticks are invalid, never widened silently.
    function room(uint256 F, uint256 k, uint256 S, uint256 i)
        internal
        pure
        returns (int24 lower, int24 upper, uint128 L)
    {
        if (i >= S / WAD) revert InvalidCurve();
        lower = boundaryTick(F, k, S, i * WAD);
        upper = boundaryTick(F, k, S, (i + 1) * WAD);
        L = liquidity(TickMath.getSqrtPriceAtTick(lower), TickMath.getSqrtPriceAtTick(upper), WAD);
    }
}
