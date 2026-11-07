// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {IRouterCore} from "./IRouterCore.sol";
import {IRebatePool} from "./IRebatePool.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {INightHook} from "./INightHook.sol";
import {INightFactory} from "./INightFactory.sol";
import {IHumanRegistry} from "./IHumanRegistry.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {INightTypes} from "./INightTypes.sol";

/// @notice Immutable dependencies; active msgSender; reentrancy guard; per-maker nonce; cumulative fill quantity per order digest. No admin.
interface ITradeRouter is INightTypes, IRouterCore {
    function settler() external view returns (address);
    function buyFor(address recipient, bytes32 night, uint256 qty, uint256 maxPaid,
        Ask[] calldata asks, Hint[] calldata hints, uint64 deadline) external returns (uint256 paid);
    function sellFor(address owner, bytes32 night, uint256 qty, uint256 minReceived,
        Hint[] calldata hints, uint64 deadline) external returns (uint256 received);
    error InvalidNonce();
    error Overfilled();
    /// @notice Immutable BookingRouter only, during its active booking/void execution.
    /// @dev Runs the same verification and filled-digest accounting as buy, then routerTransfer
    /// to BookingRouter. BookingRouter prefunds gross plus fee in USDC; this entry pays the
    /// maker gross, distributes separate fees and rebate, and emits Trade atomically.
    /// taker must match BookingRouter.msgSender(); reject incomplete ladders and expired nights.
    function fillBookingAsk(Ask calldata ask, address taker) external returns (uint256 gross, uint256 fee);
    /// @notice Orb trader only. Buys exact qty tenths from caller-supplied asks and pool in ascending live marginal price, checking maxPaid including fees.
    /// @dev Pool buys are exact output NightToken. Uses Permit2 AllowanceTransfer only for taker USDC; NightToken.routerTransfer pulls maker tokens.
    /// Validates signature, expiry, shared nonce, tenth-sized order/fill and remaining size/balance in the same path.
    /// Maker receives ceil(qty * price / 1e18) gross; taker pays gross plus separate half-up fees.
    function buy(
        bytes32 night,
        uint256 qty,
        uint256 maxPaid,
        Ask[] calldata asks,
        Hint[] calldata hints,
        uint64 deadline
    ) external returns (uint256 paid);
    /// @notice Orb trader only. Sells exact qty tenths as exact INPUT NightToken, with minReceived after late fee and no partial fill.
    function sell(bytes32 night, uint256 qty, uint256 minReceived, Hint[] calldata hints, uint64 deadline)
        external
        returns (uint256 received);
    /// @notice Maker only for its own nonce. Invalidates all asks and agent quotes used by either router.
    function cancelAll() external returns (uint256 newNonce);
    /// @notice Public current maker nonce.
    function nonces(address maker) external view returns (uint256);
    /// @notice Public filled quantity by typed order digest.
    function filled(bytes32 digest) external view returns (uint256);
    /// @notice Public shared NightShares version 1 order domain; verifyingContract is TradeRouter.
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    /// @notice Public original user while executing; zero outside execution. Hook must verify immutable router identity.
    function msgSender() external view returns (address);
    /// @notice PoolManager only during an active router unlock; settles negative deltas and takes positive deltas.
    function unlockCallback(bytes calldata data) external returns (bytes memory);

    // Public dependency and accounting views expose the complete implementation ABI.
    function bookingRouter() external view returns (address);
    function rebatePool() external view returns (IRebatePool);
}
