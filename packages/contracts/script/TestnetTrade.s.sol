// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {Script, console2} from "forge-std/Script.sol";
import {NightFactory} from "../src/NightFactory.sol";
import {HumanRegistry} from "../src/HumanRegistry.sol";
import {INightTypes} from "../src/interfaces/INightTypes.sol";
import {ITradeRouter} from "../src/interfaces/ITradeRouter.sol";
import {OrderLib} from "../src/libraries/OrderLib.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

interface IERC20Min {
    function approve(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

/// Testnet-only smoke trade: open one night, buy 0.1 share from the pool, sell it back.
/// The deployer acts as host and trader. Keys come from env (DEPLOYER_PK, ATTESTER_PK).
contract TestnetTrade is Script, INightTypes {
    function run() external {
        require(block.chainid == 5042002, "testnet only");
        string memory json = vm.readFile("deployments/5042002.json");
        NightFactory factory = NightFactory(vm.parseJsonAddress(json, ".NightFactory"));
        HumanRegistry registry = HumanRegistry(vm.parseJsonAddress(json, ".HumanRegistry"));
        ITradeRouter trade = ITradeRouter(vm.parseJsonAddress(json, ".TradeRouter"));
        address usdc = vm.parseJsonAddress(json, ".USDC");
        address permit2 = vm.parseJsonAddress(json, ".PERMIT2");
        uint256 pk = vm.envUint("DEPLOYER_PK");
        uint256 attesterKey = vm.envUint("ATTESTER_PK");
        address me = vm.addr(pk);
        address attester = vm.addr(attesterKey);
        require(attester == vm.parseJsonAddress(json, ".ATTESTER"), "attester mismatch");
        uint64 deadline = uint64(block.timestamp + 1 days);
        uint256 humanId = vm.envOr("HUMAN_ID", uint256(1));
        string memory propertyId = vm.envOr("PROPERTY_ID", string("ns-testnet-demo"));
        bytes32 property = keccak256(bytes(propertyId));

        vm.startBroadcast(pk);
        if (attester.balance < 0.1 ether) payable(attester).transfer(0.2 ether); // gas for setOrb
        if (registry.humanIdOf(me) == 0) {
            registry.linkWallet(humanId, me, deadline, _sig(attesterKey, OrderLib.digest(
                registry.DOMAIN_SEPARATOR(), OrderLib.hashWallet(humanId, me, deadline, false))));
        }
        if (factory.ownerOf(property) != me) {
            factory.bindProperty(property, me, deadline, _sig(attesterKey, OrderLib.digest(
                factory.DOMAIN_SEPARATOR(), OrderLib.hashProperty(property, me, deadline))));
        }
        bytes32 night = factory.registerNightIdentity(propertyId, "double", "2030-01-01");
        vm.stopBroadcast();

        if (!registry.isOrb(me)) {
            vm.startBroadcast(attesterKey);
            registry.setOrb(registry.humanIdOf(me), true);
            vm.stopBroadcast();
        }

        (,, uint64 checkIn) = factory.identities(night);
        NightConfig memory c = NightConfig(500000, 1.2e18, 10e18, 0, checkIn - 1 hours, me,
            property, keccak256("double"), night, checkIn);
        require(factory.poolCost(c) <= factory.MAX_POOL(), "pool limit");
        bytes32 salt;
        for (uint256 i;; ++i) {
            salt = bytes32(i);
            if (factory.predictToken(c, salt) < usdc) break;
        }

        vm.startBroadcast(pk);
        (, address token) = factory.openNight(c, salt);
        factory.addLadderChunk(night, 0, 10);
        IERC20Min(usdc).approve(permit2, type(uint256).max);
        IAllowanceTransfer(permit2).approve(usdc, address(trade), type(uint160).max, type(uint48).max);
        IAllowanceTransfer(permit2).approve(usdc, vm.parseJsonAddress(json, ".BookingRouter"), type(uint160).max,
            type(uint48).max);
        IERC20Min(token).approve(address(trade), type(uint256).max);
        // Forge's local EVM lacks Arc's USDC system precompile (0x1800..01), so buy/sell are sent with cast.
        uint256 paid;
        uint256 received;
        if (vm.envOr("TRADE", false)) {
            paid = trade.buy(night, 1e17, 5e6, new Ask[](0), new Hint[](0), deadline);
            received = trade.sell(night, 1e17, 0, new Hint[](0), deadline);
        }
        vm.stopBroadcast();

        console2.log("night");
        console2.logBytes32(night);
        console2.log("token", token);
        console2.log("paid (USDC 6dp)", paid);
        console2.log("received (USDC 6dp)", received);
    }

    function _sig(uint256 key, bytes32 digest) private pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }
}
