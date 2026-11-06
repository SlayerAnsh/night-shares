// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {RouterCore} from "./TradeRouter.sol";
import {ITradeRouter} from "./interfaces/ITradeRouter.sol";
import {INightToken} from "./interfaces/INightToken.sol";
import {OrderLib} from "./libraries/OrderLib.sol";
import {IBookingRouter} from "./interfaces/IBookingRouter.sol";
import {FeeMath} from "./libraries/FeeMath.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";

contract BookingRouter is RouterCore, IBookingRouter {
    using SafeTransferLib for address;

    address public immutable tradeRouter;
    uint256 public bookingCount;
    mapping(bytes32 => Booking) private bookings;

    constructor(address factory_, Deployment memory d) RouterCore(factory_, d, true) {
        if (d.tradeRouter == address(0)) revert InvalidConfig();
        tradeRouter = d.tradeRouter;
    }

    function msgSender() external view returns (address) {
        return activeUser;
    }

    function booking(bytes32 id) external view returns (Booking memory) {
        return bookings[id];
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        return _callback(data);
    }

    function buyAndRedeem(bytes32 night, uint256 maxPrice)
        external
        execution
        returns (bytes32 bookingId, uint256 paid)
    {
        return _book(night, maxPrice, new Ask[](0), new Hint[](0), type(uint64).max);
    }

    function buyAndRedeem(bytes32 night, uint256 maxPrice, Ask[] calldata asks, Hint[] calldata hints, uint64 deadline)
        external
        execution
        returns (bytes32 bookingId, uint256 paid)
    {
        return _book(night, maxPrice, asks, hints, deadline);
    }

    function _book(bytes32 night, uint256 maxPrice, Ask[] memory asks, Hint[] memory hints, uint64 deadline)
        private
        returns (bytes32 bookingId, uint256 paid)
    {
        NightConfig memory c = _check(night, 1e18, deadline);
        if (!registry.isVerified(activeUser)) revert Unauthorized();
        INightToken token = INightToken(factory.tokenOf(night));
        if (token.burned() > c.S || c.S - token.burned() < 1e18) revert SoldOut();
        token.setHints(hints);
        uint256 missing;
        (paid, missing) = _route(night, 1e18, maxPrice, asks, c.X);
        if (missing != 0) {
            uint256 strike = OrderLib.fillCost(missing, c.X);
            if (strike > maxPrice - paid) revert Slippage();
            _pull(address(token), strike);
            if (token.recall(missing, activeUser) != strike) revert InvalidConfig();
            paid += strike;
        }
        token.burn(1e18);
        bookingId = keccak256(abi.encode(block.chainid, address(this), ++bookingCount));
        bookings[bookingId] = Booking(night, activeUser, 1e18, paid, c.checkIn);
        emit Booked(night, activeUser, bookingId, 1e18, paid);
    }

    function buyAndVoid(bytes32 night, uint256 qty, uint256 maxPaid, Ask[] calldata asks, uint64 deadline)
        external
        execution
        returns (uint256 paid)
    {
        NightConfig memory c = _check(night, qty, deadline);
        uint256 human = registry.humanIdOf(activeUser);
        if (!registry.isVerified(activeUser) || human == 0 || human != registry.humanIdOf(c.host)) {
            revert Unauthorized();
        }
        INightToken token = INightToken(factory.tokenOf(night));
        if (token.burned() > c.S || qty > c.S - token.burned()) revert SoldOut();
        uint256 missing;
        (paid, missing) = _route(night, qty, maxPaid, asks, type(uint256).max);
        if (missing != 0) revert SoldOut();
        token.burn(qty);
    }

    function _fillAsk(Ask memory ask) internal override returns (uint256 gross) {
        gross = OrderLib.fillCost(ask.qty, ask.order.price);
        uint256 fee = FeeMath.halfUp(gross, 130, 10000);
        _pull(tradeRouter, gross + fee);
        (uint256 actual, uint256 actualFee) = ITradeRouter(tradeRouter).fillBookingAsk(ask, activeUser);
        if (actual != gross || actualFee != fee) revert InvalidConfig();
        gross += fee;
    }
}
