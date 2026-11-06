// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {INightTypes} from "./INightTypes.sol";

/// @notice World ID human IDs are uint256 uniqueness nullifiers for night-shares-enroll.
/// @dev Attester-signed wallet links aggregate caps across every linked wallet, including agents.
interface IHumanRegistry is INightTypes {
    error IdentityAlreadyBound();
    error UnsafeRelink();
    event WalletLinked(address indexed wallet, uint256 indexed humanId);
    event WalletRelinked(address indexed wallet, uint256 indexed previousHumanId, uint256 indexed humanId);
    event AttesterChanged(address indexed attester);
    /// @notice Platform only. Rotates the trusted attester.
    function setAttester(address attester_) external;
    function attester() external view returns (address);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    /// @notice Anyone relays an unexpired attester signature; rejects an already linked wallet.
    /// @dev LinkWallet(uint256 humanId,address wallet,uint64 deadline), registry domain.
    /// Consume the digest. humanId is a nonzero enrollment nullifier, never a session ID.
    function linkWallet(uint256 humanId, address wallet, uint64 deadline, bytes calldata sig) external;
    /// @notice Anyone relays a distinct attester-signed relink; consume the digest against replay.
    /// @dev RelinkWallet(uint256 humanId,address wallet,uint64 deadline), registry domain.
    /// Live NightToken positions retain their cached humanId until the wallet exits.
    /// A relink must not erase identity bans or upgrade verification.
    function relinkWallet(uint256 humanId, address wallet, uint64 deadline, bytes calldata sig) external;
    /// @notice Attester only. Records Device/Orb verification from the enrollment proof.
    function setOrb(uint256 humanId, bool orb) external;
    /// @notice Platform only. Permanently bans false walk reporters.
    function banWalkReporter(uint256 humanId) external;
    function humanIdOf(address wallet) external view returns (uint256);
    function isOrb(address wallet) external view returns (bool);
    function isVerified(address wallet) external view returns (bool);
    function walkBanned(uint256 humanId) external view returns (bool);

    // Public dependency and accounting views expose the complete implementation ABI.
    function consumed(bytes32) external view returns (bool);
    function owner() external view returns (address);
}
