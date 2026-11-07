// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {CreditLib} from "./libraries/CreditLib.sol";
import {NightPosition} from "./libraries/NightPosition.sol";
import {INightToken} from "./interfaces/INightToken.sol";
import {INightFactory} from "./interfaces/INightFactory.sol";
import {IHumanRegistry} from "./interfaces/IHumanRegistry.sol";
import {INightHook} from "./interfaces/INightHook.sol";
import {FeeMath} from "./libraries/FeeMath.sol";
import {LadderMath} from "./libraries/LadderMath.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {SqrtPriceMath} from "v4-core/src/libraries/SqrtPriceMath.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";

contract NightToken is INightToken {
    address public immutable factory;
    bytes32 public night;
    uint256 public totalSupply;
    uint256 public burned;
    uint256 public released;
    uint256 public S;
    uint256 public X;
    uint256 public cap;
    uint64 public cutoff;
    uint256 public dustMinted;
    mapping(address => uint256) public credits;
    mapping(address => bool) public inList;
    address public head;
    uint256 public holderCount;
    mapping(address => uint256) private balances;
    bool public cutoffCollected;
    uint256 public held;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(uint256 => uint256) private humanBalances;
    mapping(address => uint256) public cachedHuman;
    mapping(address => address) public next;
    mapping(address => address) public prev;
    mapping(address => bool) public excluded;
    Deployment private d;
    bool public paused;
    function setPaused(bool value) external {
        if (msg.sender != INightHook(d.hook).owner()) revert Unauthorized();
        paused = value;
    }
    bool private initialized;
    bool private entered;
    error InsufficientBalance();
    error InsufficientAllowance();
    error ZeroAddress();

    constructor(address factory_) {
        factory = factory_;
    }
    modifier guard() {
        if (entered) revert Reentrancy();
        entered = true;
        _;
        entered = false;
    }

    function withdrawCredit(address recipient) external guard returns (uint256) {
        return CreditLib.withdraw(credits, d.usdc, recipient);
    }

    function balanceOf(address account) external view returns (uint256) {
        return cutoffCollected && !excluded[account] ? 0 : balances[account];
    }

    function humanBalance(uint256 humanId) external view returns (uint256) {
        return cutoffCollected ? 0 : humanBalances[humanId];
    }

    function snapshotBalance(address account) external view returns (uint256) {
        return cutoffCollected && !excluded[account] ? balances[account] : 0;
    }

    /// @notice Freezes the holder list and transfers its aggregate without walking it.
    function collectAllAtCutoff() public guard returns (uint256 amount) {
        if (msg.sender != d.settlement) revert Unauthorized();
        if (block.timestamp < cutoff) revert BeforeCutoff();
        if (cutoffCollected) revert AlreadyInitialized();
        cutoffCollected = true;
        amount = held;
        held = 0;
        released -= amount;
        balances[d.settlement] += amount;
    }

    function snapshotAtCutoff() external returns (uint256 amount, address first) {
        amount = collectAllAtCutoff();
        first = head;
    }

    function cutoffBalanceOf(address account) external view returns (uint256) {
        return cutoffCollected && !excluded[account] ? balances[account] : 0;
    }

    function cutoffNext(address account) external view returns (address) {
        return cutoffCollected ? next[account] : address(0);
    }

    function burnCutoffInventory() external guard returns (uint256 amount) {
        if (msg.sender != d.settlement) revert Unauthorized();
        if (block.timestamp < cutoff) revert BeforeCutoff();
        if (!cutoffCollected) revert InvalidConfig();
        address[3] memory accounts = [d.settlement, d.vault, d.poolManager];
        for (uint256 i; i < accounts.length; ++i) {
            uint256 balance = balances[accounts[i]];
            balances[accounts[i]] = 0;
            amount += balance;
            emit Transfer(accounts[i], address(0), balance);
        }
        totalSupply -= amount;
    }

    function name() external pure returns (string memory) {
        return "NightShares Room Night";
    }

    function symbol() external pure returns (string memory) {
        return "NIGHT";
    }

    function decimals() external pure returns (uint8) {
        return 18;
    }

    /// @notice Deposit enough for ten separately rounded exact-output swaps per room.
    function seedPosition(uint256 i)
        public
        view
        returns (int24 lower, int24 upper, uint128 liquidity, uint256 deposit)
    {
        NightConfig memory c = INightFactory(factory).config(night);
        return NightPosition.room(c.F, c.k, c.S, i);
    }

    function initialize(bytes32 id) external {
        if (msg.sender != factory) revert Unauthorized();
        if (initialized) revert AlreadyInitialized();
        initialized = true;
        night = id;
        NightConfig memory c = INightFactory(factory).config(id);
        d = INightFactory(factory).dependencies();
        S = c.S;
        X = c.X;
        cap = FeeMath.capOf(S);
        cutoff = c.cutoff;
        excluded[address(0)] = true;
        excluded[d.vault] = true;
        excluded[d.poolManager] = true;
        excluded[d.tradeRouter] = true;
        excluded[d.bookingRouter] = true;
        excluded[d.settlement] = true;
        uint256 supply;
        for (uint256 i; i < S / 1e18; i++) {
            (,,, uint256 deposit) = seedPosition(i);
            supply += deposit;
        }
        dustMinted = supply - S;
        totalSupply = supply;
        balances[d.vault] = supply;
        emit Transfer(address(0), d.vault, supply);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external guard returns (bool) {
        _update(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external guard returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            if (a < amount) revert InsufficientAllowance();
            allowance[from][msg.sender] = a - amount;
        }
        _update(from, to, amount);
        return true;
    }

    function routerTransfer(address from, address to, uint256 amount) external guard {
        if (msg.sender != d.tradeRouter && msg.sender != d.bookingRouter) revert Unauthorized();
        _update(from, to, amount);
    }

    function _reserve(address a) private view returns (bool) {
        return a == d.poolManager || a == d.vault || a == d.settlement;
    }

    function _update(address from, address to, uint256 amount) private {
        if ((!excluded[from] || !excluded[to]) && (paused || INightHook(d.hook).paused())) revert Paused();
        if (cutoffCollected && (!excluded[from] || !excluded[to])) revert CutoffReached();
        if (to == address(0) || from == address(0)) revert ZeroAddress();
        if (
            block.timestamp >= cutoff
                && !((_reserve(from) && _reserve(to))
                    || (msg.sender == d.settlement && to == d.settlement && !excluded[from]))
        ) revert CutoffReached();
        if ((!excluded[from] || !excluded[to]) && amount % 1e17 != 0) revert InvalidQuantity();
        if (balances[from] < amount) revert InsufficientBalance();
        if (amount == 0 || from == to) {
            emit Transfer(from, to, amount);
            return;
        }
        if (_reserve(from) && !_reserve(to)) released += amount;
        if (released + burned > S) revert SoldOut();
        if (!_reserve(from) && _reserve(to)) released -= amount;
        if (!excluded[from]) {
            held -= amount;
            _remove(from);
            humanBalances[cachedHuman[from]] -= amount;
        }
        if (!excluded[to]) {
            held += amount;
            if (!IHumanRegistry(d.registry).isVerified(to)) revert UnverifiedHuman(to);
            if (balances[to] == 0) cachedHuman[to] = IHumanRegistry(d.registry).humanIdOf(to);
            uint256 id = cachedHuman[to];
            if (id == 0) revert UnverifiedHuman(to);
            _remove(to);
            humanBalances[id] += amount;
            if (humanBalances[id] > cap) revert CapExceeded(id, humanBalances[id], cap);
        }
        balances[from] -= amount;
        balances[to] += amount;
        if (!excluded[from]) {
            if (balances[from] == 0) delete cachedHuman[from];
            else _insert(from, to);
        }
        if (!excluded[to]) _insert(to, address(0));
        emit Transfer(from, to, amount);
    }

    function _before(address a, address b) private view returns (bool) {
        return balances[a] > balances[b] || (balances[a] == balances[b] && uint160(a) < uint160(b));
    }

    function _remove(address a) private {
        if (!inList[a]) return;
        inList[a] = false;
        address p = prev[a];
        address n = next[a];
        if (p == address(0)) head = n;
        else next[p] = n;
        if (n != address(0)) prev[n] = p;
        delete prev[a];
        delete next[a];
        holderCount--;
    }

    function setHints(Hint[] calldata hints) external {
        for (uint256 i; i < hints.length; i++) {
            bytes32 slot = keccak256(abi.encode("NightToken.hint", hints[i].account));
            address p = hints[i].prev;
            address n = hints[i].next;
            assembly ("memory-safe") {
                tstore(slot, p)
                tstore(add(slot, 1), n)
            }
        }
    }

    function _valid(address a, address p, address n) private view returns (bool) {
        return p != a && n != a
            && (p == address(0) ? head == n : inList[p] && balances[p] != 0 && !excluded[p] && next[p] == n && _before(p, a))
            && (n == address(0) || (inList[n] && balances[n] != 0 && !excluded[n] && prev[n] == p && _before(a, n)));
    }

    function _insert(address a, address counterparty) private {
        bytes32 slot = keccak256(abi.encode("NightToken.hint", a));
        address p;
        address n;
        assembly ("memory-safe") {
            p := tload(slot)
            n := tload(add(slot, 1))
            tstore(slot, 0)
            tstore(add(slot, 1), 0)
        }
        if ((p != address(0) && p == counterparty) || (n != address(0) && n == counterparty) || !_valid(a, p, n)) {
            p = address(0);
            n = head;
            uint256 steps;
            while (n != address(0) && _before(n, a)) {
                if (steps++ == 64) revert HintSearchExhausted();
                p = n;
                n = next[n];
            }
        }
        prev[a] = p;
        next[a] = n;
        if (p == address(0)) head = a;
        else next[p] = a;
        if (n != address(0)) prev[n] = a;
        inList[a] = true;
        holderCount++;
    }

    function burn(uint256 amount) external guard {
        if (msg.sender != d.bookingRouter && msg.sender != d.settlement) revert Unauthorized();
        if (amount == 0 || amount % 1e17 != 0) revert InvalidQuantity();
        if (balances[msg.sender] < amount) revert InsufficientBalance();
        if (msg.sender == d.bookingRouter) {
            if (block.timestamp >= cutoff) revert CutoffReached();
            released -= amount;
        }
        burned += amount;
        if (burned > S) revert SoldOut();
        balances[msg.sender] -= amount;
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }

    function burnVaultDust() external guard returns (uint256 amount) {
        if (msg.sender != d.settlement) revert Unauthorized();
        if (block.timestamp < cutoff) revert BeforeCutoff();
        amount = balances[d.vault];
        balances[d.vault] = 0;
        totalSupply -= amount;
        emit Transfer(d.vault, address(0), amount);
    }

    /// @notice Burns fractional tokens returned to Settlement after pool removal.
    function burnCutoffRemainder() external guard returns (uint256 amount) {
        if (msg.sender != d.settlement) revert Unauthorized();
        if (block.timestamp < cutoff) revert BeforeCutoff();
        amount = balances[msg.sender] % 1e17;
        balances[msg.sender] -= amount;
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }

    function collectAtCutoff(address holder, uint256 qty) external guard {
        if (msg.sender != d.settlement) revert Unauthorized();
        if (block.timestamp < cutoff) revert BeforeCutoff();
        if (excluded[holder]) revert InvalidQuantity();
        _update(holder, d.settlement, qty);
    }

    function recall(uint256 qty, address guest) external guard returns (uint256 grossPaid) {
        if (msg.sender != d.bookingRouter) revert Unauthorized();
        if (block.timestamp >= cutoff) revert CutoffReached();
        if (qty == 0 || qty % 1e17 != 0) revert InvalidQuantity();
        uint256 cumulative;
        while (qty != 0) {
            address h = head;
            if (h == address(0)) revert SoldOut();
            uint256 amount = balances[h] < qty ? balances[h] : qty;
            cumulative += amount;
            uint256 aggregate = FullMath.mulDivRoundingUp(X, cumulative, 1e18);
            uint256 gross = aggregate - grossPaid;
            uint256 fee = FeeMath.halfUp(gross, 130, 10000);
            _update(h, d.bookingRouter, amount);
            qty -= amount;
            grossPaid += gross;
            SafeTransferLib.safeTransfer(d.usdc, d.hook, fee);
            INightHook(d.hook).distributeFee(night, h, gross, true);
            CreditLib.pay(credits, d.usdc, h, gross - fee);
            emit Recalled(night, h, guest, amount, gross - fee);
        }
    }
}
