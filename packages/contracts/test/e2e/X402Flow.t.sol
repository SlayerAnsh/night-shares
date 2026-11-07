// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {SettlerFixture} from "../x402/SettlerFixture.sol";
import {IX402Settler} from "../../src/interfaces/IX402Settler.sol";
import {NightHook} from "../../src/NightHook.sol";
import {Deploy} from "../../script/Deploy.s.sol";

contract DeployManifestHarness is Deploy {
    function _deploymentPath() internal pure override returns (string memory) {
        return "out/x402-offline-test.json";
    }

    function write(address factory, Deployment memory d) external {
        _writeDeployment(factory, d, address(this), address(0x123), address(0x124), address(0x125), 1e6, 50e6, 100e18, 20);
    }
}

contract X402FlowTest is SettlerFixture {
    function test_x402FullFlowConservesUSDC() public {
        // maker is the agent wallet and ALT is its already linked human's own wallet.
        _settleBuy(_buyAuth(45e17, 100000e6, 0), 45e17, 0); _conserved();
        for (uint256 i; i < 3; ++i) _buy(address(uint160(0x900 + i)), 35e17);
        assertEq(token.released(), c.S);
        uint256 agentBefore = cash.balanceOf(maker);
        vm.prank(GUEST); booking.buyAndRedeem(night, c.X);
        assertEq(token.balanceOf(maker), 35e17); assertGt(cash.balanceOf(maker), agentBefore); _conserved();
        _settleSell(_sellAuth(5e17, 1, 0), 1, 0); assertEq(token.balanceOf(maker), 3e18); _conserved();
        vm.prank(PLATFORM); NightHook(d.hook).setPaused(true);
        IX402Settler.Authorization memory a = IX402Settler.Authorization(maker, ALT, 2e18, 0, c.cutoff, bytes32(uint256(99)));
        token.transferWithAuthorization(a.from, a.to, a.value, a.validAfter, a.validBefore, a.nonce, _signature(address(token), a));
        assertEq(token.balanceOf(ALT), 2e18); assertEq(token.humanBalance(2), 3e18); _conserved();
        a.value = cash.balanceOf(maker);
        cash.transferWithAuthorization(a.from, a.to, a.value, a.validAfter, a.validBefore, a.nonce, _signature(USDC, a));
        assertEq(cash.balanceOf(maker), 0); _conserved();
        vm.warp(c.cutoff); settlement.settleCutoff(night); _conserved();
        uint256 refund = settlement.claimable(night, maker); assertGt(refund, 0);
        settlement.pushBatch(night, 100); assertEq(cash.balanceOf(maker), refund); _conserved();
        a.value = refund; a.validBefore = type(uint256).max; a.nonce = bytes32(uint256(100));
        cash.transferWithAuthorization(a.from, a.to, a.value, a.validAfter, a.validBefore, a.nonce, _signature(USDC, a));
        assertEq(cash.balanceOf(maker), 0); assertEq(settlement.remainingReserve(night), 0); _conserved();
    }
    function test_deploymentManifestContainsX402AndDomains() public {
        vm.setEnv("USDC_EIP712_NAME", "USDC"); vm.setEnv("USDC_EIP712_VERSION", "2");
        DeployManifestHarness harness = new DeployManifestHarness(); harness.write(address(factory), d);
        string memory path = "out/x402-offline-test.json";
        string memory json = vm.readFile(path);
        assertEq(vm.parseJsonAddress(json, ".X402Settler"), d.settler);
        assertEq(vm.parseJsonAddress(json, ".NightTokenDeployer"), factory.tokenDeployer());
        assertEq(vm.parseJsonString(json, ".USDC_EIP712.name"), "USDC");
        assertEq(vm.parseJsonString(json, ".USDC_EIP712.version"), "2");
        assertTrue(vm.keyExistsJson(json, ".abis.X402Settler"));
        assertTrue(vm.keyExistsJson(json, ".abis.NightToken"));
        assertTrue(vm.keyExistsJson(json, ".abis.TradeRouter"));
        assertTrue(vm.keyExistsJson(json, ".abis.NightFactory")); vm.removeFile(path);
    }
}
