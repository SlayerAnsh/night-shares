// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {INightTypes} from "../interfaces/INightTypes.sol";

/// @notice Both routers use the TradeRouter order domain; Settlement uses its own domain for walks.
library OrderLib {
    bytes32 internal constant ORDER_TYPEHASH =
        keccak256("Order(bytes32 night,uint256 size,uint256 price,uint64 expiry,uint256 nonce,address maker)");
    bytes32 internal constant WALK_TYPEHASH = keccak256(
        "WalkAttestation(bytes32 reportId,bytes32 bookingId,bytes32 property,address guest,uint256 paid,bytes32 evidenceHash,uint64 reportedAt,uint64 deadline)"
    );
    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 internal constant BIND_PROPERTY_TYPEHASH =
        keccak256("BindProperty(bytes32 property,address hostPayout,uint64 deadline)");
    bytes32 internal constant LINK_WALLET_TYPEHASH =
        keccak256("LinkWallet(uint256 humanId,address wallet,uint64 deadline)");
    bytes32 internal constant RELINK_WALLET_TYPEHASH =
        keccak256("RelinkWallet(uint256 humanId,address wallet,uint64 deadline)");
    error InvalidQuantity();

    /// @notice Gross maker proceeds, rounded up independently of separate half-up fees.
    function fillCost(uint256 size, uint256 price) internal pure returns (uint256) {
        if (size == 0 || size % 1e17 != 0) revert InvalidQuantity();
        return FullMath.mulDivRoundingUp(size, price, 1e18);
    }

    function hashProperty(bytes32 property, address hostPayout, uint64 deadline) internal pure returns (bytes32) {
        return keccak256(abi.encode(BIND_PROPERTY_TYPEHASH, property, hostPayout, deadline));
    }

    function hashWallet(uint256 humanId, address wallet, uint64 deadline, bool relink) internal pure returns (bytes32) {
        return keccak256(abi.encode(relink ? RELINK_WALLET_TYPEHASH : LINK_WALLET_TYPEHASH, humanId, wallet, deadline));
    }

    function domainSeparator(uint256 chainId, address verifyingContract) internal pure returns (bytes32) {
        return
            keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("NightShares"), keccak256("1"), chainId, verifyingContract));
    }

    function hash(INightTypes.Order memory order) internal pure returns (bytes32) {
        return keccak256(abi.encode(ORDER_TYPEHASH, order));
    }

    function hash(INightTypes.WalkAttestation memory report) internal pure returns (bytes32) {
        return keccak256(abi.encode(WALK_TYPEHASH, report));
    }

    function digest(bytes32 domain, bytes32 structHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(hex"1901", domain, structHash));
    }
}
