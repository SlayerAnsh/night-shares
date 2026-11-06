// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {LadderMath} from "./LadderMath.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {SqrtPriceMath} from "v4-core/src/libraries/SqrtPriceMath.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";

/// @notice Shared position definition, including the rounding inventory reserved for ten fills.
library NightPosition {
    function room(uint256 F, uint256 k, uint256 S, uint256 i)
        internal
        pure
        returns (int24 lower, int24 upper, uint128 liquidity, uint256 deposit)
    {
        (lower, upper,) = LadderMath.room(F, k, S, i);
        uint160 a = TickMath.getSqrtPriceAtTick(lower);
        uint160 b = TickMath.getSqrtPriceAtTick(upper);
        // Round both stages up. The 100 wei cushion covers per-tenth swap rounding.
        uint256 l = FullMath.mulDivRoundingUp(1e18 + 100, a, uint256(b) - a);
        l = FullMath.mulDivRoundingUp(l, b, 1 << 96);
        if (l > uint256(uint128(type(int128).max))) revert LadderMath.InvalidRange();
        liquidity = uint128(l);
        deposit = SqrtPriceMath.getAmount0Delta(a, b, liquidity, true);
        if (deposit < 1e18 || deposit - 1e18 > 1e9) revert LadderMath.InvalidRange();
    }
}

