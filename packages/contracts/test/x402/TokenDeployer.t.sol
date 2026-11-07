// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {X402Fixture} from "./X402Fixture.sol";
import {NightTokenDeployer} from "../../src/NightTokenDeployer.sol";
contract TokenDeployerTest is X402Fixture {
    function test_predictTokenMatchesDeployedToken() public {
        bytes32 nextNight = factory.registerNightIdentity("hotel", "prediction", "2030-01-02");
        NightConfig memory config = c;
        config.night = nextNight; config.roomType = keccak256("prediction");
        config.checkIn += 1 days; config.cutoff += 1 days;
        bytes32 salt;
        for (uint256 i;; ++i) { salt = bytes32(i); if (factory.predictToken(config, salt) < USDC) break; }
        address predicted = factory.predictToken(config, salt);
        vm.prank(HOST); (, address actual) = factory.openNight(config, salt);
        assertEq(predicted, actual); assertEq(factory.tokenOf(nextNight), actual);
    }
    function test_onlyFactoryDeploys() public {
        NightTokenDeployer deployer = NightTokenDeployer(factory.tokenDeployer());
        vm.expectRevert(Unauthorized.selector); deployer.deploy(bytes32(0));
    }
    function test_factoryRuntimeHasHeadroom() public { assertLe(address(factory).code.length, 22000); }
}
