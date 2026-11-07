// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Script} from "forge-std/Script.sol";
import {INightFactory} from "../src/interfaces/INightFactory.sol";
import {DeployLib} from "./DeployLib.sol";
import {INightTypes} from "../src/interfaces/INightTypes.sol";

contract Deploy is Script, INightTypes {
    function run() external {
        require(block.chainid == vm.envUint("CHAIN_ID"), "CHAIN_ID mismatch");
        address manager = vm.envAddress("POOL_MANAGER");
        address usdc = vm.envAddress("USDC");
        address permit2 = vm.envAddress("PERMIT2");
        address attester = vm.envAddress("ATTESTER");
        address platform = vm.envAddress("PLATFORM");
        address owner = vm.envAddress("OWNER");
        require(manager.code.length != 0 && usdc.code.length != 0 && permit2.code.length != 0, "missing dependency code");
        uint256 maxF = vm.envOr("MAX_F", uint256(1e6));
        uint256 maxPool = vm.envOr("MAX_POOL", uint256(50e6));
        uint256 maxS = vm.envOr("MAX_S", uint256(100)) * 1e18;
        uint256 maxOpen = vm.envOr("MAX_OPEN_NIGHTS", uint256(20));
        _checkMainnetConfig(owner, attester, platform, maxF, maxPool, maxS, maxOpen,
            block.chainid == 5042 && vm.envOr("ALLOW_CUSTOM_LIMITS", false));
        // The CLI selects the broadcaster, including a Foundry keystore account.
        vm.startBroadcast();
        (, address sender,) = vm.readCallers();
        address helper = vm.computeCreateAddress(sender, vm.getNonce(sender) + 8);
        (address factory, Deployment memory d) = DeployLib.deploy(sender, manager, usdc, permit2, platform, attester,
            owner, maxF, maxPool, maxS, maxOpen);
        vm.stopBroadcast();
        _writeDeployment(factory, d, sender, helper, attester, owner, maxF, maxPool, maxS, maxOpen);
    }

    function _checkMainnetConfig(address owner, address attester, address platform,
        uint256 maxF, uint256 maxPool, uint256 maxS, uint256 maxOpen, bool allowCustomLimits) internal view {
        if (block.chainid != 5042) return;
        require(allowCustomLimits
            || (maxF == 1e6 && maxPool == 50e6 && maxS == 100e18 && maxOpen == 20),
            "Arc mainnet requires default limits unless ALLOW_CUSTOM_LIMITS=true");
        require(owner != attester && owner != platform && attester != platform,
            "Arc mainnet OWNER, ATTESTER and PLATFORM must be distinct");
        require(owner != msg.sender && attester != msg.sender && platform != msg.sender,
            "Arc mainnet roles must differ from deployer");
    }

    function _writeDeployment(address factory, Deployment memory d, address sender, address helper,
        address attester, address owner, uint256 maxF, uint256 maxPool, uint256 maxS, uint256 maxOpen) internal {
        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "block", block.number);
        vm.serializeAddress(key, "HookDeployer", helper);
        vm.serializeAddress(key, "deployer", sender);
        vm.serializeAddress(key, "NightFactory", factory);
        vm.serializeAddress(key, "NightTokenDeployer", INightFactory(factory).tokenDeployer());
        vm.serializeAddress(key, "NightVault", d.vault);
        vm.serializeAddress(key, "NightHook", d.hook);
        vm.serializeAddress(key, "TradeRouter", d.tradeRouter);
        vm.serializeAddress(key, "BookingRouter", d.bookingRouter);
        vm.serializeAddress(key, "Settlement", d.settlement);
        vm.serializeAddress(key, "X402Settler", d.settler);
        vm.serializeAddress(key, "HumanRegistry", d.registry);
        vm.serializeAddress(key, "CoverFund", d.coverFund);
        vm.serializeAddress(key, "RebatePool", d.rebatePool);
        vm.serializeAddress(key, "POOL_MANAGER", d.poolManager);
        vm.serializeAddress(key, "USDC", d.usdc);
        vm.serializeAddress(key, "PERMIT2", d.permit2);
        vm.serializeAddress(key, "ATTESTER", attester);
        vm.serializeAddress(key, "PLATFORM", d.platform);
        vm.serializeAddress(key, "OWNER", owner);
        vm.serializeUint(key, "MAX_F", maxF);
        vm.serializeUint(key, "MAX_POOL", maxPool);
        vm.serializeUint(key, "MAX_S", maxS / 1e18);
        string memory json = vm.serializeUint(key, "MAX_OPEN_NIGHTS", maxOpen);
        string memory path = string.concat("deployments/", vm.envOr("DEPLOYMENT_NAME", vm.toString(block.chainid)), ".json");
        vm.writeJson(json, path);
        vm.writeJson(json, path, ".constructorConfig");
        string memory domain = "domain";
        vm.serializeString(domain, "name", "NightShares");
        vm.serializeString(domain, "version", "1");
        vm.serializeUint(domain, "chainId", block.chainid);
        vm.writeJson(vm.serializeAddress(domain, "verifyingContract", d.tradeRouter), path, ".EIP712Domain");
        string memory usdcDomain = "usdcDomain";
        vm.serializeString(usdcDomain, "name", vm.envOr("USDC_EIP712_NAME", string("USDC")));
        vm.writeJson(vm.serializeString(usdcDomain, "version", vm.envOr("USDC_EIP712_VERSION", string("2"))), path, ".USDC_EIP712");
        string[12] memory names = ["NightFactory", "NightVault", "NightHook", "TradeRouter", "BookingRouter",
            "Settlement", "HumanRegistry", "CoverFund", "RebatePool", "NightToken", "X402Settler", "NightTokenDeployer"];
        vm.writeJson("{}", path, ".abis");
        for (uint256 i; i < names.length; ++i) {
            string memory artifact = vm.readFile(string.concat("out/", names[i], ".sol/", names[i], ".json"));
            vm.writeJson(_abi(artifact), path, string.concat(".abis.", names[i]));
        }
        vm.writeJson(_abi(vm.readFile("out/DeployLib.sol/HookDeployer.json")), path, ".abis.HookDeployer");

    }

    function _abi(string memory artifact) private pure returns (string memory) {
        // serializeJson accepts a raw JSON value; parseJsonKeys cannot reconstruct tuple ABI metadata.
        bytes memory data = bytes(artifact);
        bytes memory needle = bytes('"abi":');
        for (uint256 i; i + needle.length < data.length; ++i) {
            bool match_ = true;
            for (uint256 j; j < needle.length; ++j) if (data[i+j] != needle[j]) match_ = false;
            if (!match_) continue;
            uint256 start = i + needle.length;
            while (data[start] != '[') ++start;
            uint256 depth;
            bool quoted;
            bool escaped;
            for (uint256 end = start; end < data.length; ++end) {
                bytes1 ch = data[end];
                if (quoted) {
                    if (escaped) escaped = false;
                    else if (ch == 0x5c) escaped = true;
                    else if (ch == '"') quoted = false;
                } else if (ch == '"') quoted = true;
                else if (ch == '[') ++depth;
                else if (ch == ']' && --depth == 0) {
                    bytes memory result = new bytes(end - start + 1);
                    for (uint256 k; k < result.length; ++k) result[k] = data[start+k];
                    return string(result);
                }
            }
        }
        revert("ABI missing");
    }
}
