// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Vm} from "forge-std/Vm.sol";
import {INightTypes} from "../src/interfaces/INightTypes.sol";

/// @notice Shared Foundry deployment routine for scripts and integration tests.
/// @dev Call with the current CREATE sender and nonce. Under broadcast, pass the broadcaster.
/// All peers are deployed normally; only the permission-bit hook uses CREATE2.
library DeployLib {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function deploy(
        address deployer,
        address manager,
        address usdc,
        address permit2,
        address platform,
        address attester
    ) internal returns (address factory, INightTypes.Deployment memory d) {
        uint256 nonce = vm.getNonce(deployer);
        factory = vm.computeCreateAddress(deployer, nonce);
        d.poolManager = manager;
        d.usdc = usdc;
        d.permit2 = permit2;
        d.platform = platform;
        d.vault = vm.computeCreateAddress(deployer, nonce + 1);
        d.tradeRouter = vm.computeCreateAddress(deployer, nonce + 2);
        d.bookingRouter = vm.computeCreateAddress(deployer, nonce + 3);
        d.settlement = vm.computeCreateAddress(deployer, nonce + 4);
        d.coverFund = vm.computeCreateAddress(deployer, nonce + 5);
        d.rebatePool = vm.computeCreateAddress(deployer, nonce + 6);
        d.registry = vm.computeCreateAddress(deployer, nonce + 7);
        address hookDeployer = vm.computeCreateAddress(deployer, nonce + 8);
        // The hook does not read Deployment.hook. Keeping it zero avoids a CREATE2 cycle.
        bytes memory hookCode =
            abi.encodePacked(vm.getCode("src/NightHook.sol:NightHook"), abi.encode(factory, d, platform));
        bytes32 hash = keccak256(hookCode);
        bytes32 salt;
        for (uint256 i;; ++i) {
            salt = bytes32(i);
            d.hook = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), hookDeployer, salt, hash)))));
            if (uint160(d.hook) & 0x3fff == 0x2aec) break;
        }
        require(_create("src/NightFactory.sol:NightFactory", abi.encode(d)) == factory, "factory address");
        require(
            _create("src/NightVault.sol:NightVault", abi.encode(factory, manager, usdc, d.settlement)) == d.vault,
            "vault address"
        );
        require(_create("src/TradeRouter.sol:TradeRouter", abi.encode(factory, d)) == d.tradeRouter, "trade address");
        require(
            _create("src/BookingRouter.sol:BookingRouter", abi.encode(factory, d)) == d.bookingRouter, "booking address"
        );
        require(
            _create("src/Settlement.sol:Settlement", abi.encode(factory, d, attester)) == d.settlement,
            "settlement address"
        );
        require(_create("src/CoverFund.sol:CoverFund", abi.encode(usdc, d.settlement)) == d.coverFund, "cover address");
        require(
            _create("src/RebatePool.sol:RebatePool", abi.encode(usdc, manager, factory, d.tradeRouter, d.bookingRouter))
                == d.rebatePool,
            "rebate address"
        );
        require(
            _create("src/HumanRegistry.sol:HumanRegistry", abi.encode(platform, attester)) == d.registry,
            "registry address"
        );
        HookDeployer helper = new HookDeployer(salt, hookCode);
        require(address(helper) == hookDeployer && helper.hook() == d.hook, "hook address");
    }

    function _create(string memory artifact, bytes memory args) private returns (address deployed) {
        bytes memory code = abi.encodePacked(vm.getCode(artifact), args);
        assembly ("memory-safe") { deployed := create(0, add(code, 32), mload(code)) }
        require(deployed != address(0), "deployment failed");
    }
}

/// @notice A normal CREATE deployment gives CREATE2 the same sender in tests and broadcasts.
/// @dev Deploys exactly once in its constructor and exposes no subsequent deployment entry.
contract HookDeployer {
    address public immutable hook;

    constructor(bytes32 salt, bytes memory code) {
        address deployed;
        assembly ("memory-safe") { deployed := create2(0, add(code, 32), mload(code), salt) }
        require(deployed != address(0), "hook deployment failed");
        hook = deployed;
    }
}
