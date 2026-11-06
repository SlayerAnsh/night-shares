// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {IRouterCore} from "./IRouterCore.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {INightHook} from "./INightHook.sol";
import {INightFactory} from "./INightFactory.sol";
import {IHumanRegistry} from "./IHumanRegistry.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {INightTypes} from "./INightTypes.sol";

/// @notice Immutable dependencies; active msgSender; guard; TradeRouter-owned shared verification, nonces and fills; monotonically generated booking IDs and booking records.
interface IBookingRouter is INightTypes, IRouterCore {
    /// @notice Both routers use this TradeRouter domain, nonce space and filled accounting.
    /// @dev Ask fills call its restricted fillBookingAsk in the same atomic execution.
    function tradeRouter() external view returns (address);
    /// @notice Verified Device or Orb guest only. Buys and burns exactly 1e18; pool and asks at or below X, then largest-holder recall. maxPrice includes all fees.
    function buyAndRedeem(bytes32 night, uint256 maxPrice) external returns (bytes32 bookingId, uint256 paid);
    /// @notice Same booking rules, with supplied asks, insertion hints and transaction deadline. Anyone may submit a valid ask; API inclusion is unnecessary.
    function buyAndRedeem(bytes32 night, uint256 maxPrice, Ask[] calldata asks, Hint[] calldata hints, uint64 deadline)
        external
        returns (bytes32 bookingId, uint256 paid);
    /// @notice Host human only. Buys and burns exact qty tenths to void rooms, without recall; pays full fees with host share redirected to RebatePool.
    function buyAndVoid(bytes32 night, uint256 qty, uint256 maxPaid, Ask[] calldata asks, uint64 deadline)
        external
        returns (uint256 paid);
    /// @notice Public immutable booking record. Paid includes fees and is the maximum walk reimbursement.
    function booking(bytes32 bookingId) external view returns (Booking memory);
    /// @notice Public original user during execution, zero otherwise, compatible with IMsgSender.
    function msgSender() external view returns (address);
    /// @notice PoolManager only inside active unlock. Burns only after token custody is received and all deltas settle.
    function unlockCallback(bytes calldata data) external returns (bytes memory);

    // Public dependency and accounting views expose the complete implementation ABI.
    function bookingCount() external view returns (uint256);
}
