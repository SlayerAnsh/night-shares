// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {LadderMath} from "../../../src/libraries/LadderMath.sol";
import {FeeMath} from "../../../src/libraries/FeeMath.sol";
import {NightPosition} from "../../../src/libraries/NightPosition.sol";
import {INightTypes} from "../../../src/interfaces/INightTypes.sol";
import {NightFactory} from "../../../src/NightFactory.sol";
import {NightToken} from "../../../src/NightToken.sol";
import {MockUSDC} from "../../mocks/MockUSDC.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta} from "v4-core/src/types/BeforeSwapDelta.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";

contract RegistryDouble {
    mapping(address => uint256) public humanIdOf;
    mapping(address => bool) public isOrb;

    function set(address a, uint256 id, bool orb) external {
        humanIdOf[a] = id;
        isOrb[a] = orb;
    }

    function isVerified(address a) external view returns (bool) {
        return humanIdOf[a] != 0;
    }
}

contract SettlementDouble {
    mapping(bytes32 => bool) public cutoffSettled;
    function finish(NightFactory factory, bytes32 id) external {
        cutoffSettled[id] = true;
        factory.notifyCutoffSettled(id);
    }
    address public attester;
    mapping(address => uint256) public incidents;

    constructor(address a) {
        attester = a;
    }

    function setIncidents(address a, uint256 n) external {
        incidents[a] = n;
    }
}

/// @dev Policy-free hook double. Tests exercise the real PoolManager, not production hook policy.
contract HookDouble {
    bool public paused;
    bool public attack;
    function setAttack(bool value) external { attack = value; }

    function beforeInitialize(address, PoolKey calldata, uint160) external pure returns (bytes4) {
        return IHooks.beforeInitialize.selector;
    }

    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IHooks.beforeAddLiquidity.selector;
    }

    function beforeSwap(address, PoolKey calldata, SwapParams calldata, bytes calldata)
        external
        pure
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        return (IHooks.beforeSwap.selector, BeforeSwapDelta.wrap(0), 0);
    }

    function afterSwap(address, PoolKey calldata, SwapParams calldata, BalanceDelta, bytes calldata)
        external
        pure
        returns (bytes4, int128)
    {
        return (IHooks.afterSwap.selector, 0);
    }

    function distributeFee(bytes32, address, uint256 gross, bool) external returns (uint256, uint256) {
        if (attack) NightToken(msg.sender).transfer(address(this), 0);
        return ((gross * 130 + 5000) / 10000, 0);
    }
}

contract VaultDouble is INightTypes {
    function openingValues(NightConfig calldata c) external pure returns (uint256 cost, uint160 initialPrice, uint256 strike) {
        cost = NightPosition.poolCost(c.F, c.k, c.S);
        initialPrice = TickMath.getSqrtPriceAtTick(LadderMath.boundaryTick(c.F, c.k, c.S, 0));
        strike = FeeMath.recallStrike(c.F, c.k, 0.25e18);
    }
    function poolCost(NightConfig calldata c) external pure returns (uint256) {
        return NightPosition.poolCost(c.F, c.k, c.S);
    }
    NightFactory public factory;
    IPoolManager public manager;
    mapping(bytes32 => uint256) public nextRoom;

    function setup(NightFactory f, IPoolManager m) external {
        factory = f;
        manager = m;
    }

    function openNight(bytes32) external view {
        require(msg.sender == address(factory));
    }

    function ladderComplete(bytes32 id) external view returns (bool) {
        return nextRoom[id] == factory.config(id).S / 1e18;
    }

    function addLadderChunk(bytes32 id, uint256 from, uint256 to) external {
        require(msg.sender == address(factory));
        nextRoom[id] = to;
        manager.unlock(abi.encode(id, from, to, address(0)));
    }

    function buy(bytes32 id, address recipient) external {
        manager.unlock(abi.encode(id, uint256(0), uint256(0), recipient));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(manager));
        (bytes32 id, uint256 from, uint256 to, address recipient) =
            abi.decode(data, (bytes32, uint256, uint256, address));
        PoolKey memory key = factory.poolKey(id);
        NightToken token = NightToken(factory.tokenOf(id));
        if (recipient == address(0)) {
            for (uint256 i = from; i < to; i++) {
                (int24 lo, int24 hi, uint128 l,) = token.seedPosition(i);
                (BalanceDelta delta,) =
                    manager.modifyLiquidity(key, ModifyLiquidityParams(lo, hi, int256(uint256(l)), bytes32(i)), "");
                manager.sync(key.currency0);
                token.transfer(address(manager), uint256(-int256(delta.amount0())));
                manager.settle();
            }
        } else {
            BalanceDelta delta = manager.swap(key, SwapParams(false, 1e17, TickMath.MAX_SQRT_PRICE - 1), "");
            require(delta.amount0() == 1e17, "partial fill");
            manager.sync(key.currency1);
            MockUSDC(Currency.unwrap(key.currency1)).transfer(address(manager), uint256(-int256(delta.amount1())));
            manager.settle();
            manager.take(key.currency0, recipient, 1e17);
        }
        return "";
    }
}
