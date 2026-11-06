// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHumanRegistry} from "./interfaces/IHumanRegistry.sol";
import {OrderLib} from "./libraries/OrderLib.sol";
import {SignatureCheckerLib} from "solady/utils/SignatureCheckerLib.sol";

contract HumanRegistry is IHumanRegistry {
    address public immutable owner;
    address public attester;
    mapping(address => uint256) public humanIdOf;
    mapping(uint256 => bool) public walkBanned;
    mapping(uint256 => bool) private verified;
    mapping(uint256 => bool) private orb;
    mapping(bytes32 => bool) public consumed;
    mapping(address => uint256[]) private identityHistory;

    constructor(address owner_, address attester_) {
        if (owner_ == address(0) || attester_ == address(0)) revert InvalidConfig();
        owner = owner_;
        attester = attester_;
    }

    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return OrderLib.domainSeparator(block.chainid, address(this));
    }

    function setAttester(address value) external {
        if (msg.sender != owner) revert Unauthorized();
        if (value == address(0)) revert InvalidConfig();
        attester = value;
        emit AttesterChanged(value);
    }

    function linkWallet(uint256 id, address wallet, uint64 deadline, bytes calldata sig) external {
        if (humanIdOf[wallet] != 0) revert IdentityAlreadyBound();
        _authorize(id, wallet, deadline, sig, false);
        humanIdOf[wallet] = id;
        identityHistory[wallet].push(id);
        emit WalletLinked(wallet, id);
    }

    function relinkWallet(uint256 id, address wallet, uint64 deadline, bytes calldata sig) external {
        uint256 previous = humanIdOf[wallet];
        if (previous == 0 || previous == id) revert UnsafeRelink();
        // Relinking cannot launder a ban or upgrade the wallet's verification level.
        if (_banned(wallet) || (!verified[previous] && verified[id]) || (!orb[previous] && orb[id])) {
            revert UnsafeRelink();
        }
        _authorize(id, wallet, deadline, sig, true);
        humanIdOf[wallet] = id;
        identityHistory[wallet].push(id);
        emit WalletRelinked(wallet, previous, id);
    }

    function _authorize(uint256 id, address wallet, uint64 deadline, bytes calldata sig, bool relink) private {
        if (id == 0 || wallet == address(0)) revert InvalidConfig();
        if (block.timestamp > deadline) revert Expired();
        bytes32 digest = OrderLib.digest(DOMAIN_SEPARATOR(), OrderLib.hashWallet(id, wallet, deadline, relink));
        if (consumed[digest] || !SignatureCheckerLib.isValidSignatureNow(attester, digest, sig)) {
            revert InvalidSignature();
        }
        consumed[digest] = true;
    }

    function setOrb(uint256 id, bool value) external {
        if (msg.sender != attester) revert Unauthorized();
        if (id == 0) revert InvalidConfig();
        verified[id] = true;
        orb[id] = value;
    }

    function banWalkReporter(uint256 id) external {
        if (msg.sender != owner) revert Unauthorized();
        if (id == 0) revert InvalidConfig();
        walkBanned[id] = true;
    }

    // A later ban on an earlier identity also follows every wallet that used it.
    function _banned(address wallet) private view returns (bool) {
        uint256[] storage history = identityHistory[wallet];
        for (uint256 i; i < history.length; ++i) {
            if (walkBanned[history[i]]) return true;
        }
        return false;
    }

    function isVerified(address wallet) external view returns (bool) {
        uint256 id = humanIdOf[wallet];
        return verified[id] && !_banned(wallet);
    }

    function isOrb(address wallet) external view returns (bool) {
        uint256 id = humanIdOf[wallet];
        return orb[id] && !_banned(wallet);
    }
}
