// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../../script/Deploy.s.sol";

contract DeployGuardHarness is Deploy {
    function check(address owner, address attester, address platform,
        uint256 maxF, uint256 maxPool, uint256 maxS, uint256 maxOpen, bool allowCustomLimits) external view {
        _checkMainnetConfig(owner, attester, platform, maxF, maxPool, maxS, maxOpen, allowCustomLimits);
    }
}

contract DeployGuardTest is Test {
    DeployGuardHarness deploy;
    address constant OWNER = address(0x101);
    address constant ATTESTER = address(0x102);
    address constant PLATFORM = address(0x103);

    function setUp() public {
        deploy = new DeployGuardHarness();
        vm.chainId(5042);
    }

    function test_mainnetDefaultsAndDistinctRolesAllowed() public view {
        deploy.check(OWNER, ATTESTER, PLATFORM, 1e6, 50e6, 100e18, 20, false);
    }

    function test_mainnetEachCustomLimitRejected() public {
        for (uint256 i; i < 4; ++i) {
            uint256[4] memory limits = [uint256(1e6), 50e6, 100e18, 20];
            limits[i] -= 1;
            vm.expectRevert("Arc mainnet requires default limits unless ALLOW_CUSTOM_LIMITS=true");
            deploy.check(OWNER, ATTESTER, PLATFORM, limits[0], limits[1], limits[2], limits[3], false);
        }
    }

    function test_mainnetCustomLimitsExplicitlyAllowed() public {
        deploy.check(OWNER, ATTESTER, PLATFORM, 2e6, 60e6, 90e18, 10, true);
    }

    function test_mainnetEachRoleCollisionRejected() public {
        vm.expectRevert("Arc mainnet OWNER, ATTESTER and PLATFORM must be distinct");
        deploy.check(OWNER, OWNER, PLATFORM, 1e6, 50e6, 100e18, 20, false);
        vm.expectRevert("Arc mainnet OWNER, ATTESTER and PLATFORM must be distinct");
        deploy.check(OWNER, ATTESTER, OWNER, 1e6, 50e6, 100e18, 20, false);
        vm.expectRevert("Arc mainnet OWNER, ATTESTER and PLATFORM must be distinct");
        deploy.check(OWNER, ATTESTER, ATTESTER, 1e6, 50e6, 100e18, 20, false);
    }

    function test_mainnetEachDeployerRoleRejectedEvenWithCustomLimitsAllowed() public {
        address[3] memory roles = [OWNER, ATTESTER, PLATFORM];
        for (uint256 i; i < roles.length; ++i) {
            vm.expectRevert("Arc mainnet roles must differ from deployer");
            vm.prank(roles[i]);
            deploy.check(OWNER, ATTESTER, PLATFORM, 2e6, 60e6, 90e18, 10, true);
        }
    }

    function test_nonMainnetConfigurationUnchanged() public {
        vm.chainId(5042002);
        deploy.check(address(this), address(this), address(this), 2e6, 60e6, 90e18, 10, false);
    }
}
