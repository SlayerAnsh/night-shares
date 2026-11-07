// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IERC3009 {
    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    error AuthorizationNotYetValid();
    error AuthorizationExpired();
    error AuthorizationReused();
    error InvalidAuthorization();
    function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter,
        uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external;
    function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter,
        uint256 validBefore, bytes32 nonce, bytes calldata signature) external;
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function TRANSFER_WITH_AUTHORIZATION_TYPEHASH() external view returns (bytes32);
}
