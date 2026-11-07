// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {IX402Settler} from "./interfaces/IX402Settler.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";
import {INightFactory} from "./interfaces/INightFactory.sol";
import {ITradeRouter} from "./interfaces/ITradeRouter.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";

/// @notice Atomic exact-payment trades using transferWithAuthorization.
contract X402Settler is IX402Settler {
    using SafeTransferLib for address;
    INightFactory public immutable factory;
    ITradeRouter public immutable tradeRouter;
    address public immutable usdc;
    mapping(address => mapping(address => mapping(bytes32 => bool))) public processed;
    bool private entered;

    constructor(address factory_, Deployment memory d) {
        if (factory_ == address(0) || d.usdc == address(0) || d.tradeRouter == address(0)) revert InvalidConfig();
        factory = INightFactory(factory_);
        tradeRouter = ITradeRouter(d.tradeRouter);
        usdc = d.usdc;
    }
    modifier guard() {
        if (entered) revert Reentrancy();
        entered = true;
        _;
        entered = false;
    }
    function buyNonce(bytes32 night, uint256 qty, uint64 deadline, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encode(keccak256("X402Buy(bytes32 night,uint256 qty,uint64 deadline,bytes32 salt)"), night, qty, deadline, salt));
    }
    function sellNonce(bytes32 night, uint256 minReceived, uint64 deadline, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encode(keccak256("X402Sell(bytes32 night,uint256 minReceived,uint64 deadline,bytes32 salt)"), night, minReceived, deadline, salt));
    }
    function _payment(address asset, Authorization calldata auth) private view {
        if (auth.to != address(this)) revert NotSettlerPayment();
        if (processed[asset][auth.from][auth.nonce]) revert AlreadyProcessed();
    }
    function _pull(address asset, Authorization calldata auth, bytes calldata signature) private returns (uint256 before_) {
        before_ = asset.balanceOf(address(this));
        processed[asset][auth.from][auth.nonce] = true;
        IERC3009(asset).transferWithAuthorization(auth.from, auth.to, auth.value, auth.validAfter,
            auth.validBefore, auth.nonce, signature);
        uint256 after_ = asset.balanceOf(address(this));
        if (after_ < before_ || after_ - before_ != auth.value) revert DeltaMismatch();
    }
    function buy(Authorization calldata auth, bytes calldata signature, bytes32 night, uint256 qty,
        Ask[] calldata asks, Hint[] calldata hints, uint64 deadline, bytes32 salt)
        external guard returns (uint256 paid) {
        _payment(usdc, auth);
        if (auth.nonce != buyNonce(night, qty, deadline, salt)) revert TermsMismatch();
        address token = factory.tokenOf(night);
        if (token == address(0)) revert UnknownNight(night);
        uint256 tokensBefore = token.balanceOf(address(this));
        uint256 before_ = _pull(usdc, auth, signature);
        usdc.safeApprove(address(tradeRouter), auth.value);
        paid = tradeRouter.buyFor(auth.from, night, qty, auth.value, asks, hints, deadline);
        usdc.safeApprove(address(tradeRouter), 0);
        if (paid > auth.value) revert Slippage();
        uint256 refunded = auth.value - paid;
        if (refunded != 0) usdc.safeTransfer(auth.from, refunded);
        if (usdc.balanceOf(address(this)) != before_ || token.balanceOf(address(this)) != tokensBefore) revert DeltaMismatch();
        emit X402Bought(night, auth.from, auth.nonce, qty, paid, refunded);
    }
    function sell(Authorization calldata auth, bytes calldata signature, bytes32 night, uint256 minReceived,
        Hint[] calldata hints, uint64 deadline, bytes32 salt) external guard returns (uint256 received) {
        address token = factory.tokenOf(night);
        if (token == address(0)) revert UnknownNight(night);
        _payment(token, auth);
        if (auth.nonce != sellNonce(night, minReceived, deadline, salt)) revert TermsMismatch();
        uint256 cashBefore = usdc.balanceOf(address(this));
        uint256 before_ = _pull(token, auth, signature);
        token.safeApprove(address(tradeRouter), auth.value);
        received = tradeRouter.sellFor(auth.from, night, auth.value, minReceived, hints, deadline);
        token.safeApprove(address(tradeRouter), 0);
        if (received < minReceived) revert Slippage();
        if (token.balanceOf(address(this)) != before_ || usdc.balanceOf(address(this)) != cashBefore) revert DeltaMismatch();
        emit X402Sold(night, auth.from, auth.nonce, auth.value, received);
    }
}
