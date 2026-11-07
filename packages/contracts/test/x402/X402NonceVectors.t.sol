// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {X402Fixture} from "./X402Fixture.sol";

interface IX402NonceVectors {
    function buyNonce(bytes32 night, uint256 qty, uint64 deadline, bytes32 salt) external pure returns (bytes32);
    function sellNonce(bytes32 night, uint256 minReceived, uint64 deadline, bytes32 salt) external pure returns (bytes32);
}

/// @notice Shared Task 5 and Task 15 vectors. Requires the real settler in DeployLib.
contract X402NonceVectorsTest is X402Fixture {
    function test_nonceVectors() public view {
        IX402NonceVectors settler = IX402NonceVectors(d.settler);
        bytes32 vectorNight = 0x1111111111111111111111111111111111111111111111111111111111111111;
        bytes32 salt = 0x2222222222222222222222222222222222222222222222222222222222222222;
        assertEq(
            settler.buyNonce(vectorNight, 1e18, 1800000000, salt),
            0xc260615787001dfb6cdbf340d7fca89318cb31a375b2efafed19238ac271ccf3
        );
        assertEq(
            settler.sellNonce(vectorNight, 1e6, 1800000000, salt),
            0xd035db4837f35c7edf6be1108a6208d8162c245aaab2dbd05ab8892d25658bfc
        );
    }
}
