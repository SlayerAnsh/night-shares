// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Shared ABI. Money is micro USDC; quantities are 18 decimal room nights.
interface INightTypes {
    /// @dev Immutable after open. S is a positive whole number of rooms. k is positive WAD.
    /// X is derived at open using the default 25% markup. IDs are UTF-8 string hashes.
    /// night hashes propertyId:roomTypeId:YYYY-MM-DD; checkIn is the 15:00 UTC timestamp.
    struct NightConfig {
        uint256 F;
        uint256 k;
        uint256 S;
        uint256 X;
        uint64 cutoff;
        address host;
        bytes32 property;
        bytes32 roomType;
        bytes32 night;
        uint64 checkIn;
    }

    /// @dev Fixed deployment wiring. No endpoint may be changed after deployment.
    struct Deployment {
        address poolManager;
        address usdc;
        address permit2;
        address vault;
        address hook;
        address bookingRouter;
        address tradeRouter;
        address settlement;
        address coverFund;
        address rebatePool;
        address registry;
        address platform;
        address settler;
    }

    struct Order {
        bytes32 night;
        uint256 size;
        uint256 price;
        uint64 expiry;
        uint256 nonce;
        address maker;
    }

    struct WalkAttestation {
        bytes32 reportId;
        bytes32 bookingId;
        bytes32 property;
        address guest;
        uint256 paid;
        bytes32 evidenceHash;
        uint64 reportedAt;
        uint64 deadline;
    }

    /// @dev Makers sign Orders; only immutable routers may pull NightToken without allowance.
    /// Permit2 AllowanceTransfer is used exclusively for taker USDC.
    struct Ask {
        Order order;
        bytes signature;
        uint256 qty;
    }

    struct Hint {
        address account;
        address prev;
        address next;
    }

    struct Booking {
        bytes32 night;
        address guest;
        uint256 qty;
        uint256 paid;
        uint64 checkIn;
    }

    /// @dev Swap hookData is abi.encode(SwapContext). Hook verifies it against router state.
    struct SwapContext {
        bytes32 night;
        address user;
        bool booking;
    }
    error LadderIncomplete();
    error InvalidChunk();
    error Unauthorized();
    error InvalidConfig();
    error UnknownNight(bytes32 night);
    error AlreadyOpened(bytes32 night);
    error CutoffReached();
    error BeforeCutoff();
    error Paused();
    error InvalidQuantity();
    error Slippage();
    error SoldOut();
    error InvalidSignature();
    error Expired();
    error Reentrancy();
    error HostSuspended(address host);
    /// @dev side 0 is buy and side 1 is sell. maker zero denotes the pool. Emit once per leg.
    event Trade(
        bytes32 indexed night,
        address indexed taker,
        address indexed maker,
        uint8 side,
        uint256 qty,
        uint256 notional,
        uint256 fee,
        uint256 makerRebate,
        uint256 coverFund
    );
    event Booked(bytes32 indexed night, address indexed guest, bytes32 bookingId, uint256 qty, uint256 paid);
    event Recalled(
        bytes32 indexed night, address indexed holder, address indexed guest, uint256 qty, uint256 paidToHolder
    );
    event Swept(bytes32 indexed property, address indexed owner, uint256 amount, uint256 hostDebtNetted);
    event CutoffReleased(bytes32 indexed night, uint256 roomsReturned, uint256 refundPerNight);
    event CutoffClaimed(bytes32 indexed night, address indexed holder, uint256 amount);
    event WalkPaid(
        bytes32 indexed reportId,
        bytes32 bookingId,
        address indexed guest,
        uint256 fromPending,
        uint256 fromFund,
        uint256 hostDebt,
        bytes32 evidenceHash
    );
    event OrderCancelledAll(address indexed maker, uint256 newNonce);
}
