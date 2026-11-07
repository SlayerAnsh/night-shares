// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Script} from "forge-std/Script.sol";
import {NightFactory} from "../src/NightFactory.sol";
import {HumanRegistry} from "../src/HumanRegistry.sol";
import {INightTypes} from "../src/interfaces/INightTypes.sol";
import {OrderLib} from "../src/libraries/OrderLib.sol";
import {MockUSDC} from "../test/mocks/MockUSDC.sol";

contract Seed is Script, INightTypes {
    string constant MNEMONIC = "test test test test test test test test test test test junk";
    function run() external {
        require(vm.envBool("FORK_ONLY") && block.chainid == 5042, "fork only");
        // Anvil-only RPC probe prevents accidentally targeting an ordinary remote node.
        vm.rpc("anvil_nodeInfo", "[]");
        string memory path = "deployments/5042-fork.json";
        string memory json = vm.readFile(path);
        NightFactory factory = NightFactory(vm.parseJsonAddress(json, ".NightFactory"));
        HumanRegistry registry = HumanRegistry(vm.parseJsonAddress(json, ".HumanRegistry"));
        MockUSDC cash = MockUSDC(vm.parseJsonAddress(json, ".USDC"));
        uint256 attesterKey = vm.deriveKey(MNEMONIC, 9);
        require(vm.addr(attesterKey) == vm.parseJsonAddress(json, ".ATTESTER"), "fork attester");
        uint64 deadline = uint64(block.timestamp + 1 days);
        uint256 count = vm.envOr("SEED_WALLETS", uint256(5));
        require(count >= 1 && count <= 5, "wallet count 1..5");
        vm.startBroadcast(vm.deriveKey(MNEMONIC, 0));
        for (uint256 i = 1; i <= count; ++i) {
            address wallet = vm.addr(vm.deriveKey(MNEMONIC, uint32(i)));
            cash.mint(wallet, 1000e6);
            registry.linkWallet(i, wallet, deadline, _sig(attesterKey,
                OrderLib.digest(registry.DOMAIN_SEPARATOR(), OrderLib.hashWallet(i, wallet, deadline, false))));
        }
        address guest = vm.addr(vm.deriveKey(MNEMONIC, 6));
        cash.mint(guest, 1000e6);
        registry.linkGuest(6, guest, deadline, _sig(attesterKey, OrderLib.digest(registry.DOMAIN_SEPARATOR(),
            keccak256(abi.encode(keccak256("LinkGuest(uint256 guestId,address wallet,uint64 deadline)"),
                uint256(6), guest, deadline)))));
        address host = vm.addr(vm.deriveKey(MNEMONIC, 1));
        bytes32 property = keccak256("demo");
        factory.bindProperty(property, host, deadline, _sig(attesterKey,
            OrderLib.digest(factory.DOMAIN_SEPARATOR(), OrderLib.hashProperty(property, host, deadline))));
        bytes32 night = factory.registerNightIdentity("demo", "double", "2030-01-01");
        vm.stopBroadcast();
        vm.startBroadcast(attesterKey);
        for (uint256 i = 1; i <= count; ++i) registry.setOrb(i, true);
        vm.stopBroadcast();
        (,, uint64 checkIn) = factory.identities(night);
        NightConfig memory c = NightConfig(500000, 1.2e18, 10e18, 0, checkIn - 1 hours, host,
            property, keccak256("double"), night, checkIn);
        require(factory.poolCost(c) <= factory.MAX_POOL(), "demo exceeds pool limit");
        bytes32 salt;
        for (uint256 i;; ++i) {
            salt = bytes32(i);
            if (factory.predictToken(c, salt) < address(cash)) break;
        }
        vm.startBroadcast(vm.deriveKey(MNEMONIC, 1));
        (, address token) = factory.openNight(c, salt);
        factory.addLadderChunk(night, 0, 10);
        vm.stopBroadcast();
        vm.writeJson(string.concat('"', vm.toString(token), '"'), path, ".NightToken");
        vm.writeJson(string.concat('"', vm.toString(night), '"'), path, ".demoNight");
        vm.writeJson(vm.toString(factory.poolCost(c)), path, ".demoPoolCost");
    }
    function _sig(uint256 key, bytes32 digest) private pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }
}
