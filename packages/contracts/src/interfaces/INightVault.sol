// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {INightTypes} from "./INightTypes.sol";

/// @notice Immutable manager and endpoints; per-night positions, seeded state, removed ranges, closing flag; pending USDC per property. No administrator.
interface INightVault is INightTypes {
    error AlreadySeeded();
    error UnearnedPosition();
    /// @notice Factory only, once. Initializes position bookkeeping without enabling trading.
    function openNight(bytes32 night) external;
    /// @notice Factory only, contiguous zero-based [fromRoom, toRoom), one unlock per chunk.
    /// @dev Owns each position with a unique room-index salt; no duplicates or skipped rooms.
    function addLadderChunk(bytes32 night, uint256 fromRoom, uint256 toRoom) external;
    function nextRoom(bytes32 night) external view returns (uint256);
    function ladderComplete(bytes32 night) external view returns (bool);
    /// @notice Unplaced token wei, outside cap, holder list and refunds; burned at cutoff.
    function dust(bytes32 night) external view returns (uint256);
    /// @notice Anyone. Removes only full positions below P(b), credits pending, nets host debt, sends remainder to fixed host.
    function sweep(bytes32 night) external returns (uint256 amount, uint256 hostDebtNetted);
    /// @notice Anyone may fund pending payouts. Pulls amount of USDC from caller for a registered property.
    function creditPending(bytes32 property, uint256 amount) external;
    /// @notice Settlement only. Pays min(requested, pending) to the validated walked guest.
    function payPending(bytes32 property, address guest, uint256 requested) external returns (uint256 paid);
    /// @notice Settlement only at cutoff. Removes remaining positions via vault-owned unlock, returns USDC and token custody to Settlement. Internal dust transfers are exempt from tenth granularity.
    function releaseAtCutoff(bytes32 night) external returns (uint256 usdc, uint256 tokens);
    /// @notice Public pending amount available to the walk waterfall.
    function pending(bytes32 property) external view returns (uint256);
    /// @notice Public cutoff-removal authorization checked by the hook inside the vault callback.
    function closing(bytes32 night) external view returns (bool);
    /// @notice PoolManager only during an active vault unlock. Settles all deltas before returning.
    function unlockCallback(bytes calldata data) external returns (bytes memory);
}
