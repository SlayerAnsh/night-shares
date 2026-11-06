// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {INightFactory} from "./INightFactory.sol";
import {INightHook} from "./INightHook.sol";
import {IHumanRegistry} from "./IHumanRegistry.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

/// @notice Shared immutable router dependencies and restricted reverting quote entry.
interface IRouterCore {
    function factory() external view returns (INightFactory);
    function hook() external view returns (INightHook);
    function permit2() external view returns (IAllowanceTransfer);
    function poolManager() external view returns (IPoolManager);
    function quotePool(bytes32 night, uint256 qty, uint160 limit) external;
    function registry() external view returns (IHumanRegistry);
    function usdc() external view returns (address);
}
