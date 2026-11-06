// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IRouterSender {
    function msgSender() external view returns (address);
}
