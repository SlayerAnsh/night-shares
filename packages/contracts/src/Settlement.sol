// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {CreditLib} from "./libraries/CreditLib.sol";
import {ISettlement} from "./interfaces/ISettlement.sol";
import {INightToken} from "./interfaces/INightToken.sol";
import {INightFactory} from "./interfaces/INightFactory.sol";
import {INightVault} from "./interfaces/INightVault.sol";
import {IBookingRouter} from "./interfaces/IBookingRouter.sol";
import {IHumanRegistry} from "./interfaces/IHumanRegistry.sol";
import {ICoverFund} from "./interfaces/ICoverFund.sol";
import {OrderLib} from "./libraries/OrderLib.sol";
import {LadderMath} from "./libraries/LadderMath.sol";
import {FeeMath} from "./libraries/FeeMath.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {SignatureCheckerLib} from "solady/utils/SignatureCheckerLib.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";

contract Settlement is ISettlement {
    bool private entered;
    modifier nonReentrant() {
        if (entered) revert Reentrancy();
        entered = true;
        _;
        entered = false;
    }
    mapping(address => uint256) public credits;
    function withdrawCredit(address recipient) external nonReentrant returns (uint256) {
        return CreditLib.withdraw(credits, usdc, recipient);
    }
    address public immutable platform;
    address public immutable usdc;
    address public immutable rebatePool;
    INightFactory public immutable factory;
    INightVault public immutable vault;
    IBookingRouter public immutable bookingRouter;
    IHumanRegistry public immutable registry;
    ICoverFund public immutable coverFund;
    IPoolManager public immutable manager;
    address public attester;
    mapping(address => uint256) public hostDebt;
    struct GuestClaim { address guest; uint256 amount; bytes32 reportId; }
    mapping(address => GuestClaim[]) public guestClaims;
    mapping(address => uint256) public guestClaimHead;
    mapping(address => uint256) public guestClaimTotal;

    function _payGuestClaims(address host, uint256 available) private returns (uint256 paid) {
        uint256 head = guestClaimHead[host];
        while (available != 0 && head < guestClaims[host].length) {
            GuestClaim storage c = guestClaims[host][head];
            uint256 amount = available < c.amount ? available : c.amount;
            c.amount -= amount;
            guestClaimTotal[host] -= amount;
            available -= amount;
            paid += amount;
            CreditLib.pay(credits, usdc, c.guest, amount);
            emit GuestClaimPaid(host, c.guest, c.reportId, amount);
            if (c.amount == 0) ++head;
        }
        guestClaimHead[host] = head;
    }
    mapping(address => uint256) public incidents;
    mapping(bytes32 => bytes32) public evidenceHash;
    mapping(bytes32 => bool) public reported;
    mapping(bytes32 => bool) public consumedReport;
    mapping(bytes32 => bool) public settling;
    mapping(bytes32 => bool) public cutoffSettled;
    mapping(bytes32 => uint256) public refundPerNight;
    mapping(bytes32 => uint256) public remainingReserve;
    mapping(bytes32 => uint256) public remainingHeld;
    mapping(bytes32 => address) public cursor;
    mapping(bytes32 => mapping(address => bool)) public claimed;
    bytes32 private activeNight;
    bool private unlocking;

    constructor(address factory_, Deployment memory d, address attester_) {
        if (
            factory_ == address(0) || d.platform == address(0) || d.usdc == address(0) || d.vault == address(0)
                || d.bookingRouter == address(0) || d.registry == address(0) || d.coverFund == address(0)
                || d.rebatePool == address(0) || d.poolManager == address(0) || attester_ == address(0)
        ) revert InvalidConfig();
        factory = INightFactory(factory_);
        platform = d.platform;
        usdc = d.usdc;
        rebatePool = d.rebatePool;
        vault = INightVault(d.vault);
        bookingRouter = IBookingRouter(d.bookingRouter);
        registry = IHumanRegistry(d.registry);
        coverFund = ICoverFund(d.coverFund);
        manager = IPoolManager(d.poolManager);
        attester = attester_;
    }

    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return OrderLib.domainSeparator(block.chainid, address(this));
    }

    function setAttester(address value) external {
        if (msg.sender != platform) revert Unauthorized();
        if (value == address(0)) revert InvalidConfig();
        attester = value;
        emit AttesterChanged(value);
    }

    function reportWalk(WalkAttestation calldata r, bytes calldata signature) external nonReentrant {
        if (consumedReport[r.reportId] || reported[r.bookingId]) revert DuplicateReport();
        if (block.timestamp > r.deadline) revert Expired();
        if (!SignatureCheckerLib.isValidSignatureNow(
                attester, OrderLib.digest(DOMAIN_SEPARATOR(), OrderLib.hash(r)), signature
            )) revert InvalidSignature();
        Booking memory b = bookingRouter.booking(r.bookingId);
        if (b.guest == address(0) || b.guest != r.guest || b.paid != r.paid || b.qty != 1e18) revert InvalidBooking();
        NightConfig memory c = factory.config(b.night);
        if (
            c.property != r.property || b.checkIn != c.checkIn || r.reportedAt < b.checkIn
                || uint256(r.reportedAt) > uint256(b.checkIn) + 24 hours || r.reportedAt > block.timestamp
        ) revert InvalidBooking();
        if (!registry.isVerified(r.guest) || registry.walkBanned(registry.humanIdOf(r.guest))) revert Unauthorized();
        address host = factory.ownerOf(r.property);
        if (host == address(0) || host != c.host) revert InvalidBooking();
        vault.collectEarned(b.night);
        (uint256 pendingPaid, uint256 advance,) = FeeMath.walkPayout(r.paid, vault.pendingForNight(b.night));
        uint256 shortfall;
        if (advance > coverFund.balance()) {
            shortfall = advance - coverFund.balance();
            advance -= shortfall;
        }
        consumedReport[r.reportId] = true;
        reported[r.bookingId] = true;
        evidenceHash[r.reportId] = r.evidenceHash;
        hostDebt[host] += advance;
        incidents[host]++;
        if (pendingPaid != 0) pendingPaid = vault.payNightPending(b.night, address(this), pendingPaid);
        if (advance != 0) coverFund.pay(address(this), advance);
        CreditLib.pay(credits, usdc, r.guest, pendingPaid + advance);
        if (shortfall != 0) {
            guestClaims[host].push(GuestClaim(r.guest, shortfall, r.reportId));
            guestClaimTotal[host] += shortfall;
            emit GuestClaimCreated(host, r.guest, r.reportId, shortfall);
        }
        emit WalkPaid(r.reportId, r.bookingId, r.guest, pendingPaid, advance,
            hostDebt[host] + guestClaimTotal[host], r.evidenceHash);
    }

    function netDebt(address host, uint256 available) external nonReentrant returns (uint256 netted) {
        if (msg.sender != address(vault)) revert Unauthorized();
        uint256 owed = hostDebt[host] + guestClaimTotal[host];
        netted = available < owed ? available : owed;
        if (netted != 0) SafeTransferLib.safeTransferFrom(usdc, msg.sender, address(this), netted);
        uint256 debtPaid = netted - _payGuestClaims(host, netted);
        hostDebt[host] -= debtPaid;
        CreditLib.pay(credits, usdc, address(coverFund), debtPaid);
    }

    function settleCutoff(bytes32 night) external nonReentrant {
        if (cutoffSettled[night]) revert AlreadySettled();
        NightConfig memory c = factory.config(night);
        if (block.timestamp < c.cutoff) revert BeforeCutoff();
        settling[night] = true;
        INightToken token = INightToken(factory.tokenOf(night));
        (uint256 held, address first) = token.snapshotAtCutoff();
        if (held > c.S || held % 1e17 != 0) revert InvalidQuantity();
        uint256 reserve;
        if (held != 0) {
            activeNight = night;
            unlocking = true;
            reserve = abi.decode(manager.unlock(abi.encode(night, held)), (uint256));
            unlocking = false;
            delete activeNight;
        }
        (uint256 total, uint256 haircut, uint256 rate) = FeeMath.cutoffRefund(reserve, held);
        refundPerNight[night] = rate;
        remainingReserve[night] = total;
        remainingHeld[night] = held;
        cursor[night] = first;
        cutoffSettled[night] = true;
        if (haircut != 0) CreditLib.pay(credits, usdc, rebatePool, haircut);
        // Vault removal uses a separate unlock after redemption has reconciled every delta.
        (uint256 hostProceeds,) = vault.releaseAtCutoff(night);
        token.burnVaultDust();
        token.burnCutoffInventory();
        hostProceeds -= _payGuestClaims(c.host, hostProceeds);
        uint256 debtPaid = hostProceeds < hostDebt[c.host] ? hostProceeds : hostDebt[c.host];
        hostDebt[c.host] -= debtPaid;
        if (debtPaid != 0) CreditLib.pay(credits, usdc, address(coverFund), debtPaid);
        if (hostProceeds > debtPaid) CreditLib.pay(credits, usdc, c.host, hostProceeds - debtPaid);
        factory.notifyCutoffSettled(night);
        settling[night] = false;
        emit CutoffReleased(night, c.S - token.burned() - held, rate);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(manager) || !unlocking) revert Unauthorized();
        (bytes32 night, uint256 held) = abi.decode(data, (bytes32, uint256));
        if (night != activeNight || !settling[night]) revert Unauthorized();
        unlocking = false;
        PoolKey memory key = factory.poolKey(night);
        if (Currency.unwrap(key.currency0) != factory.tokenOf(night) || Currency.unwrap(key.currency1) != usdc) {
            revert InvalidConfig();
        }
        NightConfig memory c = factory.config(night);
        uint160 floor = TickMath.getSqrtPriceAtTick(LadderMath.boundaryTick(c.F, c.k, c.S, 0));
        BalanceDelta delta = manager.swap(
            key, SwapParams(true, -int256(held), floor), abi.encode(SwapContext(night, address(this), false))
        );
        if (delta.amount0() > 0 || delta.amount1() < 0) revert Slippage();
        uint256 consumed = uint256(-int256(delta.amount0()));
        if (consumed > held) revert Slippage();
        // Sweeping buffered positions can leave a sub-tenth redemption residue.
        // Bound it by the original rounding inventory; burn it with cutoff inventory.
        // The entire recovered USDC reserve still belongs to the original held snapshot.
        if (held - consumed != 0 && held - consumed > INightToken(factory.tokenOf(night)).dustMinted()) {
            revert Slippage();
        }
        manager.sync(key.currency0);
        SafeTransferLib.safeTransfer(Currency.unwrap(key.currency0), address(manager), consumed);
        if (manager.settle() != consumed) revert Slippage();
        uint256 recovered = uint256(uint128(delta.amount1()));
        if (recovered != 0) manager.take(key.currency1, address(this), recovered);
        return abi.encode(recovered);
    }

    function claimable(bytes32 night, address holder) public view returns (uint256) {
        if (!cutoffSettled[night] || claimed[night][holder]) return 0;
        return FullMath.mulDiv(INightToken(factory.tokenOf(night)).cutoffBalanceOf(holder), refundPerNight[night], 1e18);
    }

    function claim(bytes32 night) external nonReentrant returns (uint256 paid) {
        if (!cutoffSettled[night]) revert BeforeCutoff();
        paid = _pay(night, msg.sender, false);
    }

    /// @notice Permissionless bounded snapshot traversal. Failed payments remain claimable.
    function pushBatch(bytes32 night, uint256 n) external nonReentrant {
        if (!cutoffSettled[night]) revert BeforeCutoff();
        INightToken token = INightToken(factory.tokenOf(night));
        address holder = cursor[night];
        for (uint256 i; i < n && holder != address(0); ++i) {
            address next = token.cutoffNext(holder);
            cursor[night] = next;
            _pay(night, holder, true);
            holder = next;
        }
    }

    function _pay(bytes32 night, address holder, bool tolerateFailure) private returns (uint256 paid) {
        if (claimed[night][holder]) return 0;
        uint256 qty = INightToken(factory.tokenOf(night)).cutoffBalanceOf(holder);
        if (qty == 0) return 0;
        paid = claimable(night, holder);
        claimed[night][holder] = true;
        remainingHeld[night] -= qty;
        remainingReserve[night] -= paid;
        if (paid != 0) {
            if (tolerateFailure) {
                (bool success, bytes memory result) =
                    usdc.call(abi.encodeWithSelector(bytes4(keccak256("transfer(address,uint256)")), holder, paid));
                uint256 returned;
                if (result.length >= 32) assembly { returned := mload(add(result, 32)) }
                if (!success || (result.length != 0 && (result.length < 32 || returned != 1))) {
                    claimed[night][holder] = false;
                    remainingHeld[night] += qty;
                    remainingReserve[night] += paid;
                    return 0;
                }
            } else {
                SafeTransferLib.safeTransfer(usdc, holder, paid);
            }
        }
        emit CutoffClaimed(night, holder, paid);
        if (remainingHeld[night] == 0) {
            uint256 residual = remainingReserve[night];
            remainingReserve[night] = 0;
            if (residual != 0) CreditLib.pay(credits, usdc, rebatePool, residual);
        }
    }
}
