// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {NightToken} from "./NightToken.sol";
import {INightTypes} from "./interfaces/INightTypes.sol";

/// @notice Keeps token creation code outside the factory runtime.
contract NightTokenDeployer is INightTypes {
    address public immutable factory;
    constructor(address factory_) { if (factory_ == address(0)) revert InvalidConfig(); factory = factory_; }
    function deploy(bytes32 salt) external returns (address token) {
        if (msg.sender != factory) revert Unauthorized();
        token = address(new NightToken{salt: salt}(factory));
    }
    function codeHash() external view returns (bytes32) {
        return keccak256(abi.encodePacked(type(NightToken).creationCode, abi.encode(factory)));
    }
}
