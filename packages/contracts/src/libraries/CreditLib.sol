// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";

/// @notice Failed recipient payments remain backed by USDC at the paying contract.
library CreditLib {
    function pay(mapping(address => uint256) storage credits, address token, address recipient, uint256 amount) internal {
        if (amount == 0) return;
        (bool success, bytes memory result) = token.call(abi.encodeWithSelector(bytes4(0xa9059cbb), recipient, amount));
        uint256 returned;
        if (result.length >= 32) assembly ("memory-safe") { returned := mload(add(result, 32)) }
        if (!success || (result.length != 0 && (result.length < 32 || returned != 1))) credits[recipient] += amount;
    }

    /// @notice Anyone may retry a credit, but its destination cannot be changed.
    function withdraw(mapping(address => uint256) storage credits, address token, address recipient)
        internal returns (uint256 amount)
    {
        amount = credits[recipient];
        credits[recipient] = 0;
        if (amount != 0) SafeTransferLib.safeTransfer(token, recipient, amount);
    }
}
