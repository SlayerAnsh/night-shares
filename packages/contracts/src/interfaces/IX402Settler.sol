// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {INightTypes} from "./INightTypes.sol";

interface IX402Settler is INightTypes {
    struct Authorization {
        address from;
        address to;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
    }
    event X402Bought(bytes32 indexed night, address indexed payer, bytes32 nonce, uint256 qty, uint256 paid, uint256 refunded);
    event X402Sold(bytes32 indexed night, address indexed payer, bytes32 nonce, uint256 qty, uint256 received);
    error NotSettlerPayment();
    error TermsMismatch();
    error DeltaMismatch();
    error AlreadyProcessed();
    function buy(Authorization calldata auth, bytes calldata signature, bytes32 night, uint256 qty,
        Ask[] calldata asks, Hint[] calldata hints, uint64 deadline, bytes32 salt) external returns (uint256 paid);
    function sell(Authorization calldata auth, bytes calldata signature, bytes32 night, uint256 minReceived,
        Hint[] calldata hints, uint64 deadline, bytes32 salt) external returns (uint256 received);
    function buyNonce(bytes32 night, uint256 qty, uint64 deadline, bytes32 salt) external pure returns (bytes32);
    function sellNonce(bytes32 night, uint256 minReceived, uint64 deadline, bytes32 salt) external pure returns (bytes32);
    function processed(address token, address from, bytes32 nonce) external view returns (bool);
}
