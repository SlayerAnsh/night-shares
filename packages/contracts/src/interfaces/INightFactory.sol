// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {INightTypes} from "./INightTypes.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";

/// @notice Immutable deployment dependencies; night configs, token addresses, pool keys and property owners. Property ownership is bound by an attester signature, never by the first opener.
interface INightFactory is INightTypes {
    error InvalidTokenOrder();
    error MaxFExceeded();
    error MaxPoolExceeded();
    error MaxSExceeded();
    error MaxOpenNightsExceeded();
    function MAX_F() external view returns (uint256);
    function MAX_POOL() external view returns (uint256);
    function MAX_OPEN_NIGHTS() external view returns (uint256);
    function openNights() external view returns (uint256);
    function closed(bytes32) external view returns (bool);
    function poolCost(NightConfig memory c) external view returns (uint256);
    function notifyCutoffSettled(bytes32 night) external;
    function registerNightIdentity(string calldata propertyId, string calldata roomTypeId, string calldata date)
        external
        returns (bytes32);
    function openNight(
        string calldata propertyId,
        string calldata roomTypeId,
        string calldata date,
        NightConfig calldata config,
        bytes32 salt
    ) external returns (bytes32 night, address token);

    /// @notice Maximum inventory in 18-decimal units: 100e18.
    function MAX_S() external view returns (uint256);
    /// @notice Anyone relays an unexpired attester signature for an unbound property.
    /// @dev EIP-712 BindProperty(bytes32 property,address hostPayout,uint64 deadline), factory domain.
    /// Consume the digest and reject rebinding; the attester is read from Settlement.attester().
    function bindProperty(bytes32 property, address hostPayout, uint64 deadline, bytes calldata sig) external;
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    /// @notice Bound host only before cutoff. Adds contiguous zero-based [fromRoom, toRoom) once.
    function addLadderChunk(bytes32 night, uint256 fromRoom, uint256 toRoom) external;
    /// @notice True only after all S / 1e18 positions are installed.
    function ladderComplete(bytes32 night) external view returns (bool);
    event NightOpened(bytes32 indexed night, address indexed token, address indexed host);
    /// @notice Public fixed deployment endpoints used by token initialization and callback validation.
    function dependencies() external view returns (Deployment memory);
    /// @notice Bound host payout only; config.host must equal caller. Checks Orb identity and fewer than two payout-identity incidents.
    /// @dev Validates immutable F/k/S/cutoff, derives X, mines token < USDC using supplied salt, initializes fee 0 / spacing 1 and starts an incomplete ladder. Requires 0 < S <= 100e18 whole rooms.
    /// Canonical strings must first be registered through registerNightIdentity.
    /// Trading is forbidden until addLadderChunk completes every position.
    function openNight(NightConfig calldata config, bytes32 salt) external returns (bytes32 night, address token);
    /// @notice Public immutable night configuration. Reverts for an unknown night.
    function config(bytes32 night) external view returns (NightConfig memory);
    /// @notice Public token address for a night.
    function tokenOf(bytes32 night) external view returns (address);
    /// @notice Public registered property payout owner.
    function ownerOf(bytes32 property) external view returns (address);
    /// @notice Public deterministic token prediction for off chain salt mining.
    function predictToken(NightConfig calldata config, bytes32 salt) external view returns (address);
    /// @notice Public canonical pool key, including the fixed hook and USDC.
    function poolKey(bytes32 night) external view returns (PoolKey memory);

    // Public dependency and accounting views expose the complete implementation ABI.
    function consumed(bytes32) external view returns (bool);
    function identities(bytes32) external view returns (bytes32 property, bytes32 roomType, uint64 checkIn);
}
