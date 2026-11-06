// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {INightFactory} from "./INightFactory.sol";
import {INightTypes} from "./INightTypes.sol";

/// @notice Immutable USDC and two routers. One shared balance for every night, no withdrawal admin.
interface IRebatePool is INightTypes {
    /// @notice Routers only. Reads the current pool price itself, checks ask <= 1.05 times price, pays min(50 bps of fill, balance) to maker.
    /// @dev Called in the fill transaction; routers cannot supply a fabricated pool reference price.
    function payMaker(bytes32 night, address maker, uint256 askPrice, uint256 qty) external returns (uint256 paid);
    /// @notice Anyone may deposit USDC. Receives late excess, cutoff haircuts and host self-trade shares by direct transfer as well.
    function deposit(uint256 amount) external;
    /// @notice Public shared USDC available for rebates.
    function balance() external view returns (uint256);

    // Public dependency and accounting views expose the complete implementation ABI.
    function bookingRouter() external view returns (address);
    function factory() external view returns (INightFactory);
    function manager() external view returns (IPoolManager);
    function tradeRouter() external view returns (address);
    function usdc() external view returns (address);
}
