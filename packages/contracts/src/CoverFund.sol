// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {ICoverFund} from "./interfaces/ICoverFund.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";

contract CoverFund is ICoverFund {
    bool private entered;
    modifier nonReentrant() {
        if (entered) revert Reentrancy();
        entered = true;
        _;
        entered = false;
    }
    address public immutable usdc;
    address public immutable settlement;
    error InsufficientCover();

    constructor(address usdc_, address settlement_) {
        if (usdc_ == address(0) || settlement_ == address(0)) revert InvalidConfig();
        usdc = usdc_;
        settlement = settlement_;
    }

    function balance() public view returns (uint256) {
        return SafeTransferLib.balanceOf(usdc, address(this));
    }

    function deposit(uint256 amount) external nonReentrant {
        SafeTransferLib.safeTransferFrom(usdc, msg.sender, address(this), amount);
    }

    function pay(address guest, uint256 amount) external nonReentrant {
        if (msg.sender != settlement) revert Unauthorized();
        if (guest == address(0)) revert InvalidConfig();
        if (amount > balance()) revert InsufficientCover();
        SafeTransferLib.safeTransfer(usdc, guest, amount);
    }
}
