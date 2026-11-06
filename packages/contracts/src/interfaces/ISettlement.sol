// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {INightVault} from "./INightVault.sol";
import {INightFactory} from "./INightFactory.sol";
import {IHumanRegistry} from "./IHumanRegistry.sol";
import {ICoverFund} from "./ICoverFund.sol";
import {IBookingRouter} from "./IBookingRouter.sol";
import {INightTypes} from "./INightTypes.sol";

/// @notice Immutable dependencies and platform; attester; consumed report and booking IDs; evidence hashes; host debt and incidents keyed by bound host payout identity; cutoff state, remaining claims and refund rate. No discretionary settlement owner.
interface ISettlement is INightTypes {
    function pushBatch(bytes32 night, uint256 n) external;
    error DuplicateReport();
    error InvalidBooking();
    error InsufficientCover();
    error AlreadySettled();
    event AttesterChanged(address indexed attester);
    /// @notice Platform only. Rotates the trusted API attester, never rewrites prior reports.
    function setAttester(address newAttester) external;
    /// @notice Public current attester.
    function attester() external view returns (address);
    /// @notice Anyone relays a valid attester signature. Validates stored booking owner/property/paid, report within 24h of 15:00 UTC check-in, deadline and replay protection.
    /// @dev Attester certifies NFC presence and absence of desk check-in. Stores evidenceHash, pays pending then fund atomically, records only the fund advance as host debt and one payout-identity incident.
    /// Reverts atomically with InsufficientCover if pending plus fund cannot pay 1x recorded paid.
    function reportWalk(WalkAttestation calldata report, bytes calldata signature) external;
    /// @notice Anyone at or after cutoff, once. Collects all holders, redeems their combined reserve without a trading hook fee, applies one 30% haircut, and releases positions via vault.
    /// @dev Stores pro-rata claims before burning; transfers haircut to RebatePool. Pool is frozen by timestamp even if nobody calls this function.
    function settleCutoff(bytes32 night) external;
    /// @notice Holder pulls its own snapshot entitlement. Consume before transfer and emit CutoffClaimed.
    /// @dev Residual USDC after the final claim goes to RebatePool; settlement never pushes holder payouts.
    function claim(bytes32 night) external returns (uint256 paid);
    /// @notice Vault only. Pulls up to available USDC to repay CoverFund and reduce host debt. Returns amount netted.
    function netDebt(address host, uint256 available) external returns (uint256 netted);
    /// @notice Public debt shared across properties bound to the supplied host payout identity.
    function hostDebt(address host) external view returns (uint256);
    /// @notice Public settled incident count, with two incidents preventing new openings.
    function incidents(address host) external view returns (uint256);
    /// @notice Public stored evidence hash for an accepted report.
    function evidenceHash(bytes32 reportId) external view returns (bytes32);
    /// @notice Public booking replay guard, independent of reportId replay guard.
    function reported(bytes32 bookingId) external view returns (bool);
    /// @notice Public active cutoff operation flag. Hook requires this plus the fixed Settlement sender for its post-cutoff swap exception.
    function settling(bytes32 night) external view returns (bool);
    /// @notice Public cutoff completion state.
    function cutoffSettled(bytes32 night) external view returns (bool);
    /// @notice Public unpaid holder entitlement in micro USDC.
    function claimable(bytes32 night, address holder) external view returns (uint256);
    /// @notice Public current-chain NightShares version 1 domain for Settlement.
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    /// @notice PoolManager only inside active cutoff unlock. Fixed Settlement address is the only post-cutoff swap exception.
    function unlockCallback(bytes calldata data) external returns (bytes memory);

    // Public dependency and accounting views expose the complete implementation ABI.
    function bookingRouter() external view returns (IBookingRouter);
    function claimed(bytes32, address) external view returns (bool);
    function consumedReport(bytes32) external view returns (bool);
    function coverFund() external view returns (ICoverFund);
    function cursor(bytes32) external view returns (address);
    function factory() external view returns (INightFactory);
    function manager() external view returns (IPoolManager);
    function platform() external view returns (address);
    function rebatePool() external view returns (address);
    function refundPerNight(bytes32) external view returns (uint256);
    function registry() external view returns (IHumanRegistry);
    function remainingHeld(bytes32) external view returns (uint256);
    function remainingReserve(bytes32) external view returns (uint256);
    function usdc() external view returns (address);
    function vault() external view returns (INightVault);
}
