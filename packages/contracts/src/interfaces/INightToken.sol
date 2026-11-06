// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {INightTypes} from "./INightTypes.sol";

/// @notice ERC-20 balances and allowances; one time initialization; immutable night, S and X; burned count; human aggregate balances; descending holder links, size and transient insertion hints. Excluded endpoints are fixed at initialization.
interface INightToken is INightTypes {
    function seedPosition(uint256 i)
        external
        view
        returns (int24 lower, int24 upper, uint128 liquidity, uint256 deposit);
    function dustMinted() external view returns (uint256);
    function released() external view returns (uint256);
    function snapshotAtCutoff() external returns (uint256 held, address first);
    function cutoffBalanceOf(address holder) external view returns (uint256);
    function cutoffNext(address holder) external view returns (address);
    function burnCutoffInventory() external returns (uint256);
    // Compatibility entry points share the same immutable snapshot.
    function collectAllAtCutoff() external returns (uint256);
    function snapshotBalance(address holder) external view returns (uint256);
    function burnCutoffRemainder() external returns (uint256);

    error CapExceeded(uint256 humanId, uint256 balance, uint256 cap);
    error UnverifiedHuman(address wallet);
    error InvalidHint();
    error HintSearchExhausted();
    error AlreadyInitialized();
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    /// @notice Factory only, once. Mints exactly S + D to NightVault for chunked ladder seeding. Endpoints come from factory dependencies.
    function initialize(bytes32 night) external;
    /// @notice Public ERC-20 metadata.
    function name() external view returns (string memory);
    /// @notice Public ERC-20 symbol.
    function symbol() external view returns (string memory);
    /// @notice Always 18.
    function decimals() external pure returns (uint8);
    /// @notice Public live supply, initially S + D.
    function totalSupply() external view returns (uint256);
    /// @notice Public balance. Nonexcluded holder balances are multiples of 1e17; vault/manager dust is exempt.
    function balanceOf(address account) external view returns (uint256);
    /// @notice Public spender allowance.
    function allowance(address owner, address spender) external view returns (uint256);
    /// @notice Owner grants spender allowance.
    function approve(address spender, uint256 amount) external returns (bool);
    /// @notice Holder transfers tenths. Enforces aggregate human cap and updates descending holder links.
    function transfer(address to, uint256 amount) external returns (bool);
    /// @notice Approved spender transfers tenths with the same cap and list rules as transfer.
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    /// @notice Only the two routers fixed at construction/factory initialization; no allowance required.
    /// @dev Routers may use this only in an atomic Order fill after TradeRouter verifies its
    /// signature, shared nonce, expiry, size and remaining fill. Cap and holder updates still apply.
    function routerTransfer(address from, address to, uint256 amount) external;
    /// @notice Settlement only after cutoff. Burns unplaced vault dust without increasing earned burns.
    function burnVaultDust() external returns (uint256 amount);
    /// @notice Anyone supplies transaction-scoped hints; validate both links before use, otherwise walk at most 64 nodes or revert.
    function setHints(Hint[] calldata hints) external;
    /// @notice BookingRouter or Settlement only. Burns tenths from its own custody and increments burned count.
    function burn(uint256 amount) external;
    /// @notice BookingRouter only. Pops largest holders, transfers qty to router, pays each X less 1.3% from prefunded USDC, emits Recalled.
    /// @dev Router funds gross strike first; token distributes fees via hook. Entire operation is atomic; qty is a multiple of 1e17.
    function recall(uint256 qty, address guest) external returns (uint256 grossPaid);
    /// @notice Settlement only after cutoff. Moves holder tenths into Settlement custody for the common reserve redemption.
    function collectAtCutoff(address holder, uint256 qty) external;
    /// @notice Public night identifier.
    function night() external view returns (bytes32);
    /// @notice Public cumulative burns, used to authorize earned position removal.
    function burned() external view returns (uint256);
    /// @notice Public aggregate by cached position identity across wallets. Relinks preserve live aggregates.
    function humanBalance(uint256 humanId) external view returns (uint256);
    /// @notice Public maximum human balance, max(1e18, 30% of S).
    function cap() external view returns (uint256);
    /// @notice Public list head; ties sort by ascending address.
    function head() external view returns (address);
    /// @notice Public next lower balance holder.
    function next(address holder) external view returns (address);
    /// @notice Public previous higher balance holder.
    function prev(address holder) external view returns (address);
    /// @notice Public holder count, bounded by 10*S/1e18.
    function holderCount() external view returns (uint256);
    /// @notice Public fixed exclusion: vault, manager, routers, Settlement and zero are outside cap and list.
    function excluded(address account) external view returns (bool);

    // Public dependency and accounting views expose the complete implementation ABI.
    function S() external view returns (uint256);
    function X() external view returns (uint256);
    function cachedHuman(address) external view returns (uint256);
    function cutoff() external view returns (uint64);
    function cutoffCollected() external view returns (bool);
    function factory() external view returns (address);
    function held() external view returns (uint256);
}
