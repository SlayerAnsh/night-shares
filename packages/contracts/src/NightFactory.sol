// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {INightFactory} from "./interfaces/INightFactory.sol";
import {INightVault} from "./interfaces/INightVault.sol";
import {IHumanRegistry} from "./interfaces/IHumanRegistry.sol";
import {ISettlement} from "./interfaces/ISettlement.sol";
import {INightToken} from "./interfaces/INightToken.sol";
import {NightToken} from "./NightToken.sol";
import {NightKeyLib} from "./libraries/NightKeyLib.sol";
import {OrderLib} from "./libraries/OrderLib.sol";
import {FeeMath} from "./libraries/FeeMath.sol";
import {LadderMath} from "./libraries/LadderMath.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {ECDSA} from "solady/utils/ECDSA.sol";

contract NightFactory is INightFactory {
    uint256 public constant MAX_S = 100e18;
    Deployment private d;
    mapping(bytes32 => NightConfig) private configs;
    mapping(bytes32 => address) public tokenOf;
    mapping(bytes32 => address) public ownerOf;
    mapping(bytes32 => bool) public consumed;

    struct Identity {
        bytes32 property;
        bytes32 roomType;
        uint64 checkIn;
    }
    mapping(bytes32 => Identity) public identities;
    bool private entered;
    modifier guard() {
        if (entered) revert Reentrancy();
        entered = true;
        _;
        entered = false;
    }

    constructor(Deployment memory deps) {
        if (
            deps.poolManager == address(0) || deps.usdc == address(0) || deps.permit2 == address(0)
                || deps.vault == address(0) || deps.hook == address(0) || deps.bookingRouter == address(0)
                || deps.tradeRouter == address(0) || deps.settlement == address(0) || deps.registry == address(0)
                || deps.platform == address(0) || deps.coverFund == address(0) || deps.rebatePool == address(0)
        ) revert InvalidConfig();
        // beforeInitialize/add/remove/swap, afterSwap, beforeDonate and both swap deltas.
        if (uint160(deps.hook) & ((1 << 14) - 1) != 0x2aec) revert InvalidConfig();
        d = deps;
    }

    function dependencies() external view returns (Deployment memory) {
        return d;
    }

    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return OrderLib.domainSeparator(block.chainid, address(this));
    }

    function bindProperty(bytes32 property, address hostPayout, uint64 deadline, bytes calldata sig) external {
        if (block.timestamp > deadline) revert Expired();
        if (property == bytes32(0) || hostPayout == address(0)) revert InvalidConfig();
        bytes32 digest = OrderLib.digest(DOMAIN_SEPARATOR(), OrderLib.hashProperty(property, hostPayout, deadline));
        if (consumed[digest] || ownerOf[property] != address(0)) revert InvalidSignature();
        address signer = ECDSA.tryRecover(digest, sig);
        if (signer == address(0) || signer != ISettlement(d.settlement).attester()) revert InvalidSignature();
        consumed[digest] = true;
        ownerOf[property] = hostPayout;
    }

    function config(bytes32 id) external view returns (NightConfig memory) {
        if (tokenOf[id] == address(0)) revert UnknownNight(id);
        return configs[id];
    }

    function poolKey(bytes32 id) public view returns (PoolKey memory) {
        address token = tokenOf[id];
        if (token == address(0)) revert UnknownNight(id);
        return PoolKey(Currency.wrap(token), Currency.wrap(d.usdc), 0, 1, IHooks(d.hook));
    }

    function predictToken(NightConfig calldata c, bytes32 salt) external view returns (address) {
        return _predict(c.night, salt);
    }

    function _salt(bytes32 id, bytes32 salt) private pure returns (bytes32) {
        return keccak256(abi.encode(id, salt));
    }

    function _predict(bytes32 id, bytes32 salt) private view returns (address) {
        bytes32 codeHash = keccak256(abi.encodePacked(type(NightToken).creationCode, abi.encode(address(this))));
        return
            address(
                uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), _salt(id, salt), codeHash))))
            );
    }

    /// @notice Registers canonical strings for callers using the frozen config-only ABI.
    function registerNightIdentity(string calldata propertyId, string calldata roomTypeId, string calldata date)
        public
        returns (bytes32 id)
    {
        _catalog(propertyId);
        _catalog(roomTypeId);
        id = NightKeyLib.night(propertyId, roomTypeId, date);
        identities[id] = Identity(NightKeyLib.property(propertyId), keccak256(bytes(roomTypeId)), _checkIn(bytes(date)));
    }

    function _catalog(string calldata value) private pure {
        bytes calldata b = bytes(value);
        if (b.length == 0) revert InvalidConfig();
        for (uint256 i; i < b.length; i++) {
            if (b[i] == ":") revert InvalidConfig();
        }
    }

    function _checkIn(bytes memory date) private pure returns (uint64) {
        if (date.length != 10 || date[4] != "-" || date[7] != "-") revert InvalidConfig();
        uint256 y;
        uint256 m;
        uint256 day;
        for (uint256 i; i < 10; i++) {
            if (i == 4 || i == 7) continue;
            uint256 digit = uint8(date[i]);
            if (digit < 48 || digit > 57) revert InvalidConfig();
            digit -= 48;
            if (i < 4) y = y * 10 + digit;
            else if (i < 7) m = m * 10 + digit;
            else day = day * 10 + digit;
        }
        if (y < 1970 || m == 0 || m > 12 || day == 0) revert InvalidConfig();
        uint256[12] memory lengths = [uint256(31), 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (y % 4 == 0 && (y % 100 != 0 || y % 400 == 0)) lengths[1] = 29;
        if (day > lengths[m - 1]) revert InvalidConfig();
        uint256 daysSince = 365 * (y - 1970) + ((y - 1) / 4 - 492) - ((y - 1) / 100 - 19) + ((y - 1) / 400 - 4);
        for (uint256 i; i + 1 < m; i++) {
            daysSince += lengths[i];
        }
        return uint64((daysSince + day - 1) * 1 days + 15 hours);
    }

    function openNight(
        string calldata propertyId,
        string calldata roomTypeId,
        string calldata date,
        NightConfig calldata input,
        bytes32 salt
    ) external guard returns (bytes32 id, address token) {
        id = registerNightIdentity(propertyId, roomTypeId, date);
        NightConfig memory c = input;
        c.night = id;
        c.property = identities[id].property;
        c.roomType = identities[id].roomType;
        c.checkIn = identities[id].checkIn;
        return _open(c, salt);
    }

    function openNight(NightConfig calldata c, bytes32 salt) external guard returns (bytes32 id, address token) {
        return _open(c, salt);
    }

    function _open(NightConfig memory c, bytes32 salt) private returns (bytes32 id, address token) {
        id = c.night;
        Identity memory identity = identities[id];
        if (
            identity.checkIn == 0 || identity.property != c.property || identity.roomType != c.roomType
                || identity.checkIn != c.checkIn
        ) revert InvalidConfig();
        if (c.host != msg.sender || ownerOf[c.property] != msg.sender) revert Unauthorized();
        if (!IHumanRegistry(d.registry).isOrb(msg.sender)) revert Unauthorized();
        if (ISettlement(d.settlement).incidents(msg.sender) >= 2) revert HostSuspended(msg.sender);
        if (tokenOf[id] != address(0)) revert AlreadyOpened(id);
        if (c.cutoff <= block.timestamp) revert CutoffReached();
        if (c.cutoff > c.checkIn || c.S == 0 || c.S > MAX_S || c.S % 1e18 != 0) revert InvalidConfig();
        int24 initialTick = LadderMath.boundaryTick(c.F, c.k, c.S, 0);
        c.X = FeeMath.recallStrike(c.F, c.k, 0.25e18);
        token = _predict(id, salt);
        if (token >= d.usdc) revert InvalidTokenOrder();
        configs[id] = c;
        tokenOf[id] = token;
        new NightToken{salt: _salt(id, salt)}(address(this));
        INightToken(token).initialize(id);
        IPoolManager(d.poolManager).initialize(poolKey(id), TickMath.getSqrtPriceAtTick(initialTick));
        INightVault(d.vault).openNight(id);
        emit NightOpened(id, token, c.host);
    }

    function ladderComplete(bytes32 id) external view returns (bool) {
        return tokenOf[id] != address(0) && INightVault(d.vault).ladderComplete(id);
    }

    function addLadderChunk(bytes32 id, uint256 fromRoom, uint256 toRoom) external guard {
        if (tokenOf[id] == address(0)) revert UnknownNight(id);
        NightConfig memory c = configs[id];
        if (msg.sender != c.host) revert Unauthorized();
        if (block.timestamp >= c.cutoff) revert CutoffReached();
        if (fromRoom != INightVault(d.vault).nextRoom(id) || fromRoom >= toRoom || toRoom > c.S / 1e18) {
            revert InvalidChunk();
        }
        INightVault(d.vault).addLadderChunk(id, fromRoom, toRoom);
    }
}
