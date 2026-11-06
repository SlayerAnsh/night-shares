// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice UTF-8 ID helpers for scripts and tests. Contracts accept the resulting bytes32 IDs.
library NightKeyLib {
    /// @dev Callers supply a canonical YYYY-MM-DD date and unambiguous catalog identifiers.
    function night(string memory propertyId, string memory roomTypeId, string memory date)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(bytes(string.concat(propertyId, ":", roomTypeId, ":", date)));
    }

    function property(string memory propertyId) internal pure returns (bytes32) {
        return keccak256(bytes(propertyId));
    }
}
