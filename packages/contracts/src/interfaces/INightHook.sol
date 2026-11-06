// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {INightTypes} from "./INightTypes.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";

import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta} from "v4-core/src/types/BeforeSwapDelta.sol";

/// @notice Immutable factory, vault, routers, Settlement and fee recipients; owner; pause state; per-pool config and seed state. No mutable router allowlist or fee parameters.
interface INightHook is INightTypes, IHooks {
    error DonationForbidden();
    error UnsupportedCallback();
    event PauseChanged(bool paused);
    /// @notice Owner only. Pauses or resumes trading; never blocks cutoff or earned sweeps.
    function setPaused(bool value) external;
    /// @notice Public pause state.
    function paused() external view returns (bool);
    /// @notice Public fixed pause owner.
    function owner() external view returns (address);
    /// @notice Public hook bitmap. Only beforeInitialize, beforeAddLiquidity, beforeRemoveLiquidity, beforeSwap, afterSwap, beforeDonate and both swap return deltas are enabled.
    function getHookPermissions() external pure returns (Hooks.Permissions memory);
    /// @notice Routers and the registered NightToken only. Caller prefunds USDC; split base fees, route host self share to RebatePool, return actual fee and cover amounts.
    /// @dev Used for asks and recalls only. Host self detection uses registry human IDs, including alternate host wallets.
    function distributeFee(bytes32 night, address user, uint256 notional, bool sell)
        external
        returns (uint256 fee, uint256 cover);

    /// @notice PoolManager only, original sender NightFactory. Reads factory config, validates currency0 token < currency1 USDC, fee 0, spacing 1 and the initial lower boundary.
    function beforeInitialize(address sender, PoolKey calldata key, uint160 sqrtPriceX96)
        external
        override
        returns (bytes4);
    /// @notice Disabled callback. Implementations revert UnsupportedCallback.
    function afterInitialize(address sender, PoolKey calldata key, uint160 sqrtPriceX96, int24 tick)
        external
        override
        returns (bytes4);
    /// @notice PoolManager only, original sender NightVault, during an authorized ladder chunk. Validates each unique room range and expected liquidity; no later additions.
    function beforeAddLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        bytes calldata hookData
    ) external override returns (bytes4);
    /// @notice Disabled callback. Implementations revert UnsupportedCallback.
    function afterAddLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        BalanceDelta delta,
        BalanceDelta feesAccrued,
        bytes calldata hookData
    ) external override returns (bytes4, BalanceDelta);
    /// @notice PoolManager only, original sender NightVault. Allows full earned positions below P(b), or Settlement-authorized cutoff through vault.closing(night).
    function beforeRemoveLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        bytes calldata hookData
    ) external override returns (bytes4);
    /// @notice Disabled callback. Implementations revert UnsupportedCallback.
    function afterRemoveLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        BalanceDelta delta,
        BalanceDelta feesAccrued,
        bytes calldata hookData
    ) external override returns (bytes4, BalanceDelta);
    /// @notice PoolManager only. Requires a complete ladder and unpaused pre-cutoff router execution and authentic msgSender; Orb for traders, Device or Orb for bookings.
    /// @dev Settlement's active cutoff redemption is the sole post-cutoff exception and pays no swap fee. Takes only USDC fees when USDC is specified; never changes curve pricing.
    function beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata hookData)
        external
        override
        returns (bytes4, BeforeSwapDelta, uint24);
    /// @notice PoolManager only. Takes fee on actual USDC notional when USDC is unspecified, distributes split, emits one Trade. Cutoff redemption emits no Trade and pays its haircut separately.
    function afterSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) external override returns (bytes4, int128);
    /// @notice Always reverts DonationForbidden, including for otherwise authorized callers.
    function beforeDonate(
        address sender,
        PoolKey calldata key,
        uint256 amount0,
        uint256 amount1,
        bytes calldata hookData
    ) external override returns (bytes4);
    /// @notice Disabled callback. Implementations revert UnsupportedCallback.
    function afterDonate(
        address sender,
        PoolKey calldata key,
        uint256 amount0,
        uint256 amount1,
        bytes calldata hookData
    ) external override returns (bytes4);
}
