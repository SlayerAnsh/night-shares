// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {INightTypes} from "./INightTypes.sol";

/// @notice Immutable USDC and Settlement. Fund balance is the ERC-20 balance; no withdrawal admin.
interface ICoverFund is INightTypes {
    /// @notice Settlement only. Pays exact requested amount to the validated guest or reverts on insufficient balance.
    function pay(address guest, uint256 amount) external;
    /// @notice Anyone may add funds through a USDC allowance transfer. Hook fees and debt repayments may transfer directly.
    function deposit(uint256 amount) external;
    /// @notice Public available USDC.
    function balance() external view returns (uint256);
}
