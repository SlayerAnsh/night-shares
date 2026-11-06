// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {MockUSDC} from "../../mocks/MockUSDC.sol";
import {INightTypes} from "../../../src/interfaces/INightTypes.sol";
import {NightVault} from "../../../src/NightVault.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";

// These doubles intentionally implement only the endpoints exercised by g2.
contract TokenDouble is MockUSDC {
    bytes32 public night;
    uint256 public burned;
    address public vault;
    address public manager;
    address public settlement;

    function endpoints(address v, address m, address s) external {
        vault = v;
        manager = m;
        settlement = s;
    }

    // Superseding S + D integration: burn excluded residues only after vault release.
    function burnVaultDust() external returns (uint256 amount) {
        require(msg.sender == settlement && NightVault(vault).closed(night));
        amount = balanceOf[vault] + balanceOf[manager];
        balanceOf[vault] = 0;
        balanceOf[manager] = 0;
        totalSupply -= amount;
    }

    function setup(bytes32 n) external {
        night = n;
    }

    function burn(uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        burned += amount;
    }
}

contract RegistryDouble {
    mapping(address => uint256) public humanIdOf;
    mapping(address => bool) public isOrb;
    mapping(address => bool) public isVerified;

    function set(address user, uint256 human, bool orb) external {
        humanIdOf[user] = human;
        isOrb[user] = orb;
        isVerified[user] = human != 0;
    }
}

contract FactoryDouble is INightTypes {
    NightConfig private c;
    PoolKey private key;
    address private token;

    function setup(NightConfig memory c_, PoolKey memory key_) external {
        c = c_;
        key = key_;
        token = Currency.unwrap(key_.currency0);
    }

    function config(bytes32 n) external view returns (NightConfig memory) {
        require(n == c.night);
        return c;
    }

    function poolKey(bytes32 n) external view returns (PoolKey memory) {
        require(n == c.night);
        return key;
    }

    function tokenOf(bytes32 n) external view returns (address) {
        return n == c.night ? token : address(0);
    }

    function ownerOf(bytes32 p) external view returns (address) {
        return p == c.property ? c.host : address(0);
    }

    function initialize(IPoolManager manager, uint160 price) external {
        manager.initialize(key, price);
    }

    function open(NightVault vault) external {
        vault.openNight(c.night);
    }

    function chunk(NightVault vault, uint256 a, uint256 b) external {
        vault.addLadderChunk(c.night, a, b);
    }
}

contract RouterDouble is INightTypes {
    using SafeTransferLib for address;
    IPoolManager public immutable manager;
    address public msgSender;
    bool public booking;

    constructor(IPoolManager m, bool b) {
        manager = m;
        booking = b;
    }

    function swap(PoolKey memory key, SwapParams memory p, bytes32 night) external returns (BalanceDelta) {
        msgSender = msg.sender;
        bytes memory result = manager.unlock(abi.encode(key, p, abi.encode(SwapContext(night, msg.sender, booking))));
        msgSender = address(0);
        return abi.decode(result, (BalanceDelta));
    }

    function rawSwap(PoolKey memory key, SwapParams memory p, bytes memory data, address user)
        external
        returns (BalanceDelta)
    {
        msgSender = user;
        bytes memory result = manager.unlock(abi.encode(key, p, data));
        msgSender = address(0);
        return abi.decode(result, (BalanceDelta));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(manager));
        (PoolKey memory key, SwapParams memory p, bytes memory hookData) =
            abi.decode(data, (PoolKey, SwapParams, bytes));
        uint256 prepaid;
        if (!p.zeroForOne) {
            // Hooks distribute USDC before the router receives its final swap delta.
            prepaid = MockUSDC(Currency.unwrap(key.currency1)).balanceOf(msgSender);
            manager.sync(key.currency1);
            Currency.unwrap(key.currency1).safeTransferFrom(msgSender, address(manager), prepaid);
            manager.settle();
        }
        BalanceDelta d = manager.swap(key, p, hookData);
        settle(key.currency0, d.amount0());
        if (prepaid != 0) manager.take(key.currency1, msgSender, uint256(int256(prepaid) + d.amount1()));
        else settle(key.currency1, d.amount1());
        return abi.encode(d);
    }

    function settle(Currency c, int128 delta) internal {
        if (delta < 0) {
            manager.sync(c);
            Currency.unwrap(c).safeTransferFrom(msgSender, address(manager), uint256(-int256(delta)));
            manager.settle();
        } else if (delta > 0) {
            manager.take(c, msgSender, uint256(int256(delta)));
        }
    }
}

contract SettlementDouble is RouterDouble {
    using SafeTransferLib for address;
    address public usdc;
    address public cover;
    address public vault;
    mapping(address => uint256) public hostDebt;
    mapping(bytes32 => bool) public settling;

    constructor(IPoolManager m, address u, address c) RouterDouble(m, false) {
        usdc = u;
        cover = c;
    }

    function setVault(address v) external {
        vault = v;
    }

    function setSettling(bytes32 n, bool value) external {
        settling[n] = value;
    }

    function debt(address host, uint256 amount) external {
        hostDebt[host] = amount;
    }

    function netDebt(address host, uint256 available) external returns (uint256 amount) {
        require(msg.sender == vault);
        amount = hostDebt[host] < available ? hostDebt[host] : available;
        hostDebt[host] -= amount;
        usdc.safeTransferFrom(msg.sender, cover, amount);
    }

    function burnDust(TokenDouble token) external returns (uint256) {
        return token.burnVaultDust();
    }

    function release(bytes32 night) external returns (uint256, uint256) {
        return NightVault(vault).releaseAtCutoff(night);
    }

    function pay(bytes32 property, address guest, uint256 amount) external returns (uint256) {
        return NightVault(vault).payPending(property, guest, amount);
    }
}
