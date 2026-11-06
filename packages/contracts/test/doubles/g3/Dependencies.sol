// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {INightTypes} from "../../../src/interfaces/INightTypes.sol";
import {ERC20} from "solady/tokens/ERC20.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {FeeMath} from "../../../src/libraries/FeeMath.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";

contract FactoryDouble is INightTypes {
    NightConfig private c;
    PoolKey private key;
    address public token;
    bool public complete = true;

    function configure(NightConfig memory c_, PoolKey memory key_) external {
        c = c_;
        key = key_;
        token = Currency.unwrap(key.currency0);
    }

    function config(bytes32) external view returns (NightConfig memory) {
        return c;
    }

    function tokenOf(bytes32 night) external view returns (address) {
        return night == c.night ? token : address(0);
    }

    function poolKey(bytes32) external view returns (PoolKey memory) {
        return key;
    }

    function ladderComplete(bytes32) external view returns (bool) {
        return complete;
    }

    function setComplete(bool value) external {
        complete = value;
    }
}

contract RegistryDouble {
    mapping(address => uint256) public humanIdOf;
    mapping(address => bool) public isOrb;

    function set(address user, uint256 id, bool orb) external {
        humanIdOf[user] = id;
        isOrb[user] = orb;
    }

    function isVerified(address user) external view returns (bool) {
        return humanIdOf[user] != 0;
    }
}

contract Permit2Double {
    using SafeTransferLib for address;

    struct Allowance {
        uint160 amount;
        uint48 expiration;
        uint48 nonce;
    }
    mapping(address => mapping(address => mapping(address => Allowance))) public allowance;

    function approve(address token, address spender, uint160 amount, uint48 expiration) external {
        allowance[msg.sender][token][spender] = Allowance(amount, expiration, 0);
    }

    function transferFrom(address from, address to, uint160 amount, address token) external {
        Allowance storage a = allowance[from][token][msg.sender];
        require(a.expiration >= block.timestamp, "Permit2 expired");
        require(a.amount >= amount, "Permit2 allowance");
        a.amount -= amount;
        token.safeTransferFrom(from, to, amount);
    }
}

contract HookDouble {
    using SafeTransferLib for address;
    address public immutable usdc;
    bool public paused;
    address public reenter;
    bool public attempted;
    bool public blocked;

    constructor(address usdc_) {
        usdc = usdc_;
    }

    function setPaused(bool value) external {
        paused = value;
    }

    function setReenter(address target) external {
        reenter = target;
    }

    function distributeFee(bytes32, address, uint256 gross, bool) external returns (uint256 fee, uint256 cover) {
        fee = FeeMath.halfUp(gross, 130, 10000);
        cover = FeeMath.halfUp(gross, 10, 10000);
        if (reenter != address(0)) {
            attempted = true;
            (bool ok,) = reenter.call(abi.encodeWithSignature("cancelAll()"));
            blocked = !ok;
        }
    }
}

contract TokenDouble is ERC20, INightTypes {
    using SafeTransferLib for address;
    address public trade;
    address public book;
    address public cash;
    address public recallHolder;
    uint256 public strike;
    uint256 public burned;
    uint256 public recalled;

    function name() public pure override returns (string memory) {
        return "Night";
    }

    function symbol() public pure override returns (string memory) {
        return "N";
    }

    function wire(address trade_, address book_, address cash_, uint256 strike_) external {
        trade = trade_;
        book = book_;
        cash = cash_;
        strike = strike_;
    }

    function mint(address to, uint256 qty) external {
        _mint(to, qty);
    }

    function setRecallHolder(address holder) external {
        recallHolder = holder;
    }
    function setHints(Hint[] calldata) external {}

    function routerTransfer(address from, address to, uint256 qty) external {
        require(msg.sender == trade || msg.sender == book, "router only");
        _transfer(from, to, qty);
    }

    function burn(uint256 qty) external {
        require(msg.sender == book, "booking only");
        _burn(msg.sender, qty);
        burned += qty;
    }

    function recall(uint256 qty, address) external returns (uint256 gross) {
        require(msg.sender == book, "booking only");
        if (balanceOf(recallHolder) < qty) revert SoldOut();
        recalled += qty;
        _transfer(recallHolder, msg.sender, qty);
        gross = FullMath.mulDivRoundingUp(qty, strike, 1e18);
        cash.safeTransfer(recallHolder, gross - FeeMath.halfUp(gross, 130, 10000));
    }
}

contract RebateDouble {
    using SafeTransferLib for address;
    IPoolManager public immutable manager;
    FactoryDouble public immutable factory;
    address public immutable usdc;

    constructor(IPoolManager m, FactoryDouble f, address u) {
        manager = m;
        factory = f;
        usdc = u;
    }

    function payMaker(bytes32 night, address maker, uint256 price, uint256 qty) external returns (uint256 paid) {
        PoolKey memory key = factory.poolKey(night);
        (uint160 sqrtPrice,,,) = StateLibrary.getSlot0(manager, key.toId());
        uint256 poolPrice = FullMath.mulDiv(uint256(sqrtPrice) * sqrtPrice, 1e18, 1 << 192);
        paid = FeeMath.makerRebate(price, poolPrice, qty, ERC20(usdc).balanceOf(address(this)));
        if (paid != 0) usdc.safeTransfer(maker, paid);
    }
}

contract Seeder {
    using SafeTransferLib for address;
    IPoolManager immutable manager;

    constructor(IPoolManager m) {
        manager = m;
    }

    function seed(PoolKey memory key, int24 lower, int24 upper, uint128 liquidity) external {
        manager.unlock(abi.encode(key, lower, upper, liquidity));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(manager));
        (PoolKey memory key, int24 lower, int24 upper, uint128 liquidity) =
            abi.decode(data, (PoolKey, int24, int24, uint128));
        (BalanceDelta delta,) = manager.modifyLiquidity(
            key, ModifyLiquidityParams(lower, upper, int256(uint256(liquidity)), bytes32(0)), ""
        );
        _pay(key.currency0, delta.amount0());
        _pay(key.currency1, delta.amount1());
        return "";
    }

    function _pay(Currency currency, int128 delta) private {
        if (delta < 0) {
            manager.sync(currency);
            Currency.unwrap(currency).safeTransfer(address(manager), uint256(-int256(delta)));
            manager.settle();
        }
    }
}
