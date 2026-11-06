# Night Shares contract system

The ten production contracts form one system. `app/SPECS.md`, its Chain design section, and the decisions below govern the implementation. Amounts are micro USDC. Token quantities are 18-decimal room nights. User balances and fills are whole tenths, or `1e17`. The maximum allotment is `100e18`.

## Decisions

1. IDs are hashed on chain from the canonical strings. The night hash is `keccak256(propertyId:roomTypeId:YYYY-MM-DD)`. Property and room type hashes use their UTF-8 strings. Empty catalog components and colons in components are rejected. The date is validated, including leap years, and determines 15:00 UTC check-in. The string opening overload performs registration itself. The config-only overload requires a previously registered identity and validates every component against it.
2. Property ownership is bound once by the current Settlement attester's EIP-712 `BindProperty(bytes32 property,address hostPayout,uint64 deadline)` signature under the factory domain. Anyone can relay it. Expired, reused, zero-payout and rebinding attempts revert. Only the bound payout address can open. It must have Orb verification and fewer than two accepted walk incidents. Historical debt and incidents remain keyed to this payout address.
3. The exact order type string remains `Order(bytes32 night,uint256 size,uint256 price,uint64 expiry,uint256 nonce,address maker)`. Both routes use the TradeRouter NightShares version 1 domain and its maker nonces and digest-keyed fills. A maker signs a positive whole-tenth size. The router verifies signature, expiry, nonce, remaining fill and balance before its gated token pull. `cancelAll` increments the nonce for both routes. There is no maximum on-chain order lifetime; 24 hours is the client default.
4. Ask cost is `ceil(qty * price / 1e18)`. The buyer pays this gross plus the separately rounded 1.3% fee. The maker receives gross, plus any independently funded rebate. This corrects the original router implementation's seller deduction. Recall retains its distinct rule: the guest pays X and the recalled holder receives X less 1.3%. Both routes consume asks alongside pool tenths in cheapest-first order. A pool tenth must fit entirely below the next supplied ask price or booking strike.
5. Permit2 AllowanceTransfer is used only for taker USDC. Users first approve USDC to Permit2 and then grant a router-specific Permit2 allowance. No permit payload is embedded in router calls. Maker NightToken pulls use only the two fixed routers after order verification. Ordinary sells require the owner's normal ERC-20 allowance.
6. Opening mints `S + D`, as explicitly required for integration. `NightPosition.room` is the single shared position calculation for token minting, vault inventory validation, seeding and hook validation. It rounds liquidity upward with a 100-token-wei cushion per room. Deposits exceed one room by at most `1e9` wei each. D is the sum of those excess deposits. `released + burned <= S` prevents this excluded rounding inventory from reaching users. D has no cap, holder-list or refund entitlement. Full S sellout in tenths is tested. This supersedes the earlier decision to mint only S, which could not support that sellout.
7. Opening does not enable trading until all positions exist. The host adds contiguous half-open room ranges through the factory. Deployment clients use chunks of ten rooms. Contracts also support other contiguous chunk lengths up to S. The vault alone owns liquidity, with one room-index salt per position. Trading, repeated additions, donations and arbitrary liquidity providers cannot bypass the hook.
8. The registry accepts attester-signed links and distinct relinks, consumes digests, enforces deadlines and preserves historical bans and verification provenance. Each NightToken caches a holder's humanId while that position is nonzero. Relinking does not move the live aggregate to a new identity. Later receives by that wallet continue under the cached identity until the wallet exits. New positions use the current registry identity. Caps sum those cached positions across wallets and equal `max(1e18, 30% of S)`.
9. Cutoff freezes ordinary trading by timestamp even if nobody has settled yet. One permissionless settlement transaction freezes the holder list and snapshots aggregate custody in O(1), redeems the held reserve, transfers the half-up 30% haircut to RebatePool, stores the floored per-token rate, removes remaining positions, burns all excluded inventory and nets host debt before paying the host remainder. It performs no holder USDC transfers. Permissionless `pushBatch(night,n)` advances a cursor over the frozen list. Failed USDC payments remain claimable. `claim(night)` is available before, during and after batching; duplicate payments are prevented. Final pro-rata rounding remainder goes to RebatePool.
10. Cutoff redemption stops at the first ladder boundary. Sweeping buffered positions and integer swap rounding can leave a tiny unconsumed token remainder. Settlement accepts it only when it is no larger than the original D, and burns it with returned cutoff inventory without increasing earned burns. The original held quantity remains the refund denominator, and every recovered USDC unit is included in the reserve. The integration regression exposes 824 token wei after a swept sellout and sellback. Larger shortfalls revert instead of hiding missing liquidity. No PoolManager currency credit is cleared or donated.
11. WalkAttestation fields remain `{bytes32 reportId,bytes32 bookingId,bytes32 property,address guest,uint256 paid,bytes32 evidenceHash,uint64 reportedAt,uint64 deadline}` under the Settlement domain. A valid report matches a recorded booking, guest, property and complete paid amount. The attester certifies reception presence and absence of desk check-in. Reporting is within 24 hours of recorded check-in, before the signature deadline, and subject to identity verification, bans and both replay guards. Refunds draw from property pending payouts first, then CoverFund. Only the fund advance becomes host debt. Insufficient combined funding or failed payment reverts all bookkeeping. Two incidents block future opening.
12. Preserve the complete field lists and indexing of Trade, Booked, Recalled, Swept, CutoffReleased, CutoffClaimed, WalkPaid and OrderCancelledAll in `INightTypes`. Preserve `bindProperty`, `linkWallet`, `buyAndRedeem`, `pushBatch`, `claim` and `claimable`. There is no deployment administrator who can replace endpoints, withdraw fund reserves, add arbitrary routers or change a curve.

## Deployment

`script/DeployLib.sol` is the reusable Foundry deployment library. It predicts the CREATE addresses of the factory and its peers, mines the hook CREATE2 salt for permission bits `0x2aec`, and deploys all peers normally with immutable wiring. A one-shot HookDeployer created at nonce + 8 performs the hook CREATE2 in its constructor. This makes the CREATE2 sender explicit in both tests and broadcasts. Pass the current CREATE sender as `deployer`; a broadcast script passes its broadcaster. The hook constructor does not read `Deployment.hook`, so its creation arguments use zero for that self-reference before the final hook address is calculated. Other peers receive the actual hook address. Every predicted address is checked after deployment.

The factory deploys each NightToken using CREATE2, with the host supplying a mined salt that sorts the token below USDC. PoolManager, USDC and Permit2 are explicit configuration. Production source contains no canonical chain-specific endpoint constants.

The e2e environment uses chain ID 5042002, a freshly deployed real PoolManager, MockUSDC runtime etched at `0x3600000000000000000000000000000000000000`, and pinned real Permit2 runtime etched at `0x000000000022D473030F116dDEE9F6B43aC78BA3`. See `test/fixtures/README.md` for runtime provenance and hash. No test doubles, mocked calls or fork network requests are used in `test/e2e`.

## Call graph and access rules

| Entry point | Calls and authorization |
| --- | --- |
| Factory.bindProperty | Anyone relays a valid current Settlement attester signature. |
| Factory.openNight | Bound Orb host only. Validate identity and incidents, deploy and initialize token, initialize PoolManager, initialize vault. |
| Factory.addLadderChunk | Bound host only. Vault unlocks PoolManager once for the chunk; hook validates every unique vault-owned position. |
| Token transfers | Owners or approved spenders. Verify recipients, enforce cached human caps, maintain descending holder links and enforce released inventory. Fixed excluded endpoints are vault, manager, routers, Settlement and zero. |
| Token.routerTransfer | Fixed TradeRouter or BookingRouter only. Routers perform signature and fill checks first. |
| Token.setHints | Anyone may provide transaction-scoped validated list hints. Invalid hints fall back to traversal of at most 64 nodes. |
| TradeRouter.buy/sell | Orb trader only. Shared execution guard, timestamp and ladder gates. PoolManager unlock callback verifies caller and operation hash. Buys deliver exact token output; sells take exact token input through ordinary allowance. |
| TradeRouter.fillBookingAsk | BookingRouter only, with taker equal to its active msgSender. TradeRouter owns verification, fills, maker pull, fees, rebate and Trade event. |
| TradeRouter.cancelAll | Maker increments its own nonce outside active execution. |
| BookingRouter.buyAndRedeem | Verified Device or Orb guest. Fill pool and asks under X, recall missing quantity from largest holders, burn exactly one room, record booking and emit Booked atomically. |
| BookingRouter.buyAndVoid | Verified host human only, including linked alternate wallets. Fill and burn requested tenths without recall. |
| Token.recall | BookingRouter only, before cutoff, with prefunded strike USDC. Largest balance first, ascending address for ties. Emits Recalled. |
| Token.burn | BookingRouter or Settlement only. Burns caller custody. Ordinary booking and void burns increase earned burns. Cutoff inventory helpers do not. |
| Vault.sweep | Anyone. Remove only fully earned room positions below P(b), net Settlement debt through CoverFund, then pay bound host. Unremoved room positions remain collateral. |
| Vault.creditPending | Anyone can transfer their own USDC into a known property's pending payouts. |
| Vault.payPending | Settlement only. Pay the smaller of requested and pending. |
| Settlement.reportWalk | Anyone relays an accepted attester signature. Registry and booking checks precede pending/fund transfers and incident/debt accounting. |
| Settlement.netDebt | Vault only. Pull the netted amount into CoverFund. |
| Settlement.settleCutoff | Anyone after cutoff, once. Token snapshot, fee-free redemption unlock, separate vault removal unlock, excluded inventory burn, host debt netting and payout. |
| Settlement.pushBatch/claim | Anyone may push bounded batches; claim pays only the caller's own snapshot. Both are guarded against reentrancy. |
| Vault.releaseAtCutoff | Settlement only. Closing flag authorizes hook removal. Returns USDC and whole-tenth token custody, leaving fractional vault residue for burn. |
| Token.snapshotAtCutoff | Settlement only, after cutoff, once. Freeze list and aggregate custody without walking holders. |
| Token.burnCutoffInventory | Settlement only, after snapshot. Burns remaining Settlement, vault and PoolManager token balances without earned burns. |
| Token.burnVaultDust/burnCutoffRemainder/collectAtCutoff | Settlement-only compatibility helpers. Before-cutoff calls revert. Production settlement uses the aggregate snapshot and full inventory burn. |
| Hook callbacks | PoolManager only for enabled callbacks, with fixed original sender and operation context checks. Disabled callbacks revert UnsupportedCallback; donation reverts DonationForbidden. |
| Hook.distributeFee | Fixed routers or the registered NightToken only; caller prefunds USDC. Ask and recall fees stay at the base rate. |
| Hook.setPaused | Fixed owner only. Pause blocks ordinary routes, not cutoff or earned sweeps. |
| CoverFund.pay | Settlement only, exact payment or revert. |
| CoverFund.deposit/RebatePool.deposit | Anyone deposits their own approved USDC. No administrator withdrawal. |
| RebatePool.payMaker | Fixed routers only. Check live PoolManager price, complete ladder, cutoff and available funds. |
| Registry.linkWallet/relinkWallet | Anyone relays the respective valid attester signature. |
| Registry.setOrb | Current registry attester only. |
| Registry.banWalkReporter/setAttester | Fixed registry owner only. Bans remain permanent. |
| Settlement.setAttester | Fixed platform only. Factory binding reads this current attester. Registry attester rotation is separate. |

Public getters are unrestricted. Router `quotePool` is external for reverting self-calls only; it rejects every caller except that active router itself. All unlock callbacks reject callers other than the configured PoolManager and reject inactive operations. Settlement finishes redemption before beginning vault removal; unlocks never nest.

The buy quote temporarily pre-settles at most available balance and router allowance, bounded by the ladder endpoint cost. The quote reverts all pool, hook, token and Permit2 effects. Actual execution pre-settles exactly the quoted payment. This supplies hook fee liquidity on an otherwise empty first buy, while consuming only the final payment from Permit2 allowance. Users' `maxPaid` and `minReceived` limits apply to complete net results and failure rolls back everything.

## Numerical rules

F and X are micro USDC per room. k is WAD. `priceWad` returns micro USDC per room times `1e18`, so raw currency1/currency0 is `priceWad / 1e36`. Each boundary uses floor(log base 1.0001 of raw price), including negative ticks. Adjacent rooms share exactly one boundary. Zero F/k, fractional or excessive S, collapsed ticks, unsupported ranges and zero liquidity revert. X is the exponential endpoint with the 25% markup rounded half up once.

Fees round half up. Base host/platform/cover shares are 100/20/10 bps. Platform gets the micro rounding remainder after bounded host and cover shares. Late sell excess goes to RebatePool. Host self-trade detection compares registry human IDs; its host fee also goes to RebatePool. Maker rebate is at most the available RebatePool balance and requires ask price no higher than 1.05 times live pool price. Rebate rate is 0.5% of gross.

Tick flooring is accepted chain behavior. At F=6000e6, k=1.2e18, S=15e18, pool `cost(6,7)` is 10091.428508 USDC and full sellout is approximately 173950.751400 USDC. The g2 parity tests retain their model discrepancy assertions. Do not alter tick arithmetic to chase continuous or model.js values.

## Interface reconciliation

No existing frozen selector, order type, attestation field or required event was removed or changed. The following additions reconcile the supplied interface baseline referenced as f304d56. No git command was used to inspect that commit.

```solidity
// INightFactory
function registerNightIdentity(string calldata propertyId, string calldata roomTypeId, string calldata date) external returns (bytes32);
function openNight(string calldata propertyId, string calldata roomTypeId, string calldata date, NightConfig calldata config, bytes32 salt) external returns (bytes32 night, address token);

// INightToken
function seedPosition(uint256 i) external view returns (int24 lower, int24 upper, uint128 liquidity, uint256 deposit);
function released() external view returns (uint256);
function dustMinted() external view returns (uint256);
function snapshotAtCutoff() external returns (uint256 held, address first);
function cutoffBalanceOf(address holder) external view returns (uint256);
function cutoffNext(address holder) external view returns (address);
function burnCutoffInventory() external returns (uint256);
function collectAllAtCutoff() external returns (uint256);
function snapshotBalance(address holder) external view returns (uint256);
function burnCutoffRemainder() external returns (uint256);

// INightVault
function requiredInventory(NightConfig calldata config) external pure returns (uint256);

// ISettlement
function pushBatch(bytes32 night, uint256 n) external;

// IRouterSender, shared router context interface
function msgSender() external view returns (address);
```

Settlement now calls INightToken directly. The inline ICutoffToken declaration is deleted. SnapshotAtCutoff, cutoffBalanceOf and cutoffNext are the canonical settlement path; the original g1 aggregate snapshot and remainder helpers remain compatible. Inline router context interfaces are replaced by `src/interfaces/IRouterSender.sol`. NightPosition is a shared library, not a contract-to-contract dependency.

All remaining public implementation getters and the restricted quote entry are now declared in interfaces as well. These are additions to interface declarations, not changes to deployed function selectors. Shared router declarations live in IRouterCore and are inherited by both router interfaces. Exact additional declarations follow.

```solidity
// INightFactory
function consumed(bytes32) external view returns (bool);
function identities(bytes32) external view returns (bytes32 property, bytes32 roomType, uint64 checkIn);

// INightToken
function S() external view returns (uint256);
function X() external view returns (uint256);
function cachedHuman(address) external view returns (uint256);
function cutoff() external view returns (uint64);
function cutoffCollected() external view returns (bool);
function factory() external view returns (address);
function held() external view returns (uint256);

// INightVault
function closed(bytes32) external view returns (bool);
function factory() external view returns (INightFactory);
function manager() external view returns (IPoolManager);
function opened(bytes32) external view returns (bool);
function removed(bytes32, uint256) external view returns (bool);
function settlement() external view returns (address);
function usdc() external view returns (address);

// INightHook
function bookingRouter() external view returns (address);
function coverFund() external view returns (address);
function factory() external view returns (INightFactory);
function initialized(PoolId) external view returns (bool);
function manager() external view returns (IPoolManager);
function nightOf(PoolId) external view returns (bytes32);
function platform() external view returns (address);
function rebatePool() external view returns (address);
function registry() external view returns (IHumanRegistry);
function removed(bytes32, uint256) external view returns (bool);
function seeded(bytes32, uint256) external view returns (bool);
function seededRooms(bytes32) external view returns (uint256);
function settlement() external view returns (address);
function tradeRouter() external view returns (address);
function usdc() external view returns (address);
function vault() external view returns (address);

// ITradeRouter
function bookingRouter() external view returns (address);
function factory() external view returns (INightFactory);
function hook() external view returns (INightHook);
function permit2() external view returns (IAllowanceTransfer);
function poolManager() external view returns (IPoolManager);
function quotePool(bytes32 night, uint256 qty, uint160 limit) external;
function rebatePool() external view returns (IRebatePool);
function registry() external view returns (IHumanRegistry);
function usdc() external view returns (address);

// IBookingRouter
function bookingCount() external view returns (uint256);
function factory() external view returns (INightFactory);
function hook() external view returns (INightHook);
function permit2() external view returns (IAllowanceTransfer);
function poolManager() external view returns (IPoolManager);
function quotePool(bytes32 night, uint256 qty, uint160 limit) external;
function registry() external view returns (IHumanRegistry);
function usdc() external view returns (address);

// ISettlement
function bookingRouter() external view returns (IBookingRouter);
function claimed(bytes32, address) external view returns (bool);
function consumedReport(bytes32) external view returns (bool);
function coverFund() external view returns (ICoverFund);
function cursor(bytes32) external view returns (address);
function factory() external view returns (INightFactory);
function manager() external view returns (IPoolManager);
function platform() external view returns (address);
function rebatePool() external view returns (address);
function refundPerNight(bytes32) external view returns (uint256);
function registry() external view returns (IHumanRegistry);
function remainingHeld(bytes32) external view returns (uint256);
function remainingReserve(bytes32) external view returns (uint256);
function usdc() external view returns (address);
function vault() external view returns (INightVault);

// ICoverFund
function settlement() external view returns (address);
function usdc() external view returns (address);

// IRebatePool
function bookingRouter() external view returns (address);
function factory() external view returns (INightFactory);
function manager() external view returns (IPoolManager);
function tradeRouter() external view returns (address);
function usdc() external view returns (address);

// IHumanRegistry
function consumed(bytes32) external view returns (bool);
function owner() external view returns (address);

```

## Validation and limitations

`forge build --offline` and `forge test --offline` pass. The final run has 116 passing tests, zero failures and zero skipped tests across six suites. Six tests in FullFlow use only the real system contracts, real PoolManager, real Permit2 and the explicitly requested USDC mock. Group suites retain their doubles and semantic coverage. The g3 artifact lookup now uses its full source path, preventing duplicate TokenDouble names from breaking setup. Its ask expectations now enforce the documented buyer fee and maker gross, rather than weakening fee assertions.

FullFlow tests sum USDC across every trader, guest, host, platform, fund, pool manager, token and system contract, including Permit2 and USDC itself. The sum equals tracked explicit mints and MockUSDC.totalSupply. Checks run after each scenario, individual pool buys in the main flow, each cutoff batch and each claim. Router and hook residual USDC must also be zero. Token supply is zero after cutoff, while earned burns retain only actual bookings and voids.

The system relies on an attester for property binding, enrollment and walked-guest evidence. The local USDC mock exercises blacklist failures but cannot reproduce Arc's native USDC system execution. The Permit2 fixture is pinned deployed runtime, not a reproducible source build within this package. Gas figures below are Foundry execution measurements with warmed state from preceding actions, not cold transaction estimates or confirmed Arc block-budget limits. Push batches must be sized to the deployment's gas budget. Registry verification walks the wallet's relink history, so its cost grows with that history.


## Measured gas

These are final Foundry `gasleft()` deltas with optimizer runs 200, via IR, Solidity 0.8.26 and Cancun. Setup, salt mining and identity enrollment are excluded from opening/chunk/cutoff deltas. Aggregate sellout includes test assertions and conservation checks, so it is not a per-transaction estimate. State is warmed by preceding operations in the test. Repeat on the target chain before selecting production block and batch budgets.

| Operation | S=15 | S=100 |
| --- | ---: | ---: |
| Open and initialize, before ladder chunks | 4,150,668 | 6,631,154 |
| Complete ladder, sum of chunks | 2,607,870 | 14,929,885 |
| Ten-room chunk, observed range | 1,740,922 | 1,460,097 to 1,630,094 |
| Cutoff after bookings, recalls, sellback and sweeps | 2,280,262 | Not measured for that exact history |
| Zero-held cutoff, all positions present | Not separately logged | 10,041,995 |
| Cutoff with 1,000 real holders and 100 real positions | Not applicable | 10,989,919 |
| Push 500 holders | Not applicable | 19,482,680 |
| Full sellout in 150 separate tenth buys, including assertions | 82,895,952 | Not applicable |

The separate 1,000-holder test also sells out all 100 rooms in 1,000 tenth buys before cutoff. A 500-holder push is intentionally a stress measurement; production callers can select smaller n. The broadcast-sender deployment test checks the same immutable wiring using an EOA broadcaster and the one-shot hook deployment helper.

## Integration defects corrected

1. NightToken and NightVault previously computed different liquidity buffers. One NightPosition library now defines the exact minted, deposited and hook-validated inventory.
2. Settlement previously called a missing inline token extension. All contracts now use the reconciled src/interfaces declarations. The frozen list is the actual token snapshot, and all returned inventory plus vault and manager token residue is burned without increasing earned burns.
3. First buys previously let the hook transfer a fee before PoolManager had USDC. Reverting quotes now pre-settle available cash, and execution pre-settles the exact quote. A finite Permit2 allowance regression proves allowance consumption equals final payment.
4. Ask fills previously deducted fees from makers despite the documented decision. Both ordinary and booking fills now charge the buyer separately and pay maker gross. Tests check exact gross, rebate and cheapest-first event order.
5. Cutoff after swept buffered positions previously reverted on a tiny unswappable token residue. The new bounded residue rule retains the original holder denominator, pays from all recovered USDC, burns residue without earned burns, and rejects any shortfall larger than D. The ladder floor also avoids a costly empty-tick scan.
6. Duplicate test artifact names previously broke g3 setup. Full artifact paths remove ambiguity. The g4 single-position fixture now configures a floor below its actual initial tick, preserving its existing payment, replay and gas assertions.

No USDC supply change occurs except explicit test mints, and every conservation check has zero micro-USDC discrepancy. Uniswap integer accounting can retain micro-USDC rounding balances in PoolManager after position removal. Those balances remain included in conservation; the application does not fabricate a claim on PoolManager or clear token credit to extract them. Cutoff refund claims and their final residual are fully accounted for separately.

## Complete external function inventory

The following inventory includes public state getters and inherited external entry points. Read-only functions have no caller restriction. State-changing access is defined in the call table above. Tuple types refer to the structs in INightTypes or the imported v4 interfaces. Constructors are described in DeployLib.

### NightFactory

```solidity
function DOMAIN_SEPARATOR() external view returns (bytes32);
function MAX_S() external view returns (uint256);
function addLadderChunk(bytes32 id, uint256 fromRoom, uint256 toRoom) external;
function bindProperty(bytes32 property, address hostPayout, uint64 deadline, bytes sig) external;
function config(bytes32 id) external view returns (INightTypes.NightConfig);
function consumed(bytes32) external view returns (bool);
function dependencies() external view returns (INightTypes.Deployment);
function identities(bytes32) external view returns (bytes32 property, bytes32 roomType, uint64 checkIn);
function ladderComplete(bytes32 id) external view returns (bool);
function openNight(INightTypes.NightConfig c, bytes32 salt) external returns (bytes32 id, address token);
function openNight(string propertyId, string roomTypeId, string date, INightTypes.NightConfig input, bytes32 salt) external returns (bytes32 id, address token);
function ownerOf(bytes32) external view returns (address);
function poolKey(bytes32 id) external view returns (PoolKey);
function predictToken(INightTypes.NightConfig c, bytes32 salt) external view returns (address);
function registerNightIdentity(string propertyId, string roomTypeId, string date) external returns (bytes32 id);
function tokenOf(bytes32) external view returns (address);
```

### NightToken

```solidity
function S() external view returns (uint256);
function X() external view returns (uint256);
function allowance(address, address) external view returns (uint256);
function approve(address spender, uint256 amount) external returns (bool);
function balanceOf(address account) external view returns (uint256);
function burn(uint256 amount) external;
function burnCutoffInventory() external returns (uint256 amount);
function burnCutoffRemainder() external returns (uint256 amount);
function burnVaultDust() external returns (uint256 amount);
function burned() external view returns (uint256);
function cachedHuman(address) external view returns (uint256);
function cap() external view returns (uint256);
function collectAllAtCutoff() external returns (uint256 amount);
function collectAtCutoff(address holder, uint256 qty) external;
function cutoff() external view returns (uint64);
function cutoffBalanceOf(address account) external view returns (uint256);
function cutoffCollected() external view returns (bool);
function cutoffNext(address account) external view returns (address);
function decimals() external pure returns (uint8);
function dustMinted() external view returns (uint256);
function excluded(address) external view returns (bool);
function factory() external view returns (address);
function head() external view returns (address);
function held() external view returns (uint256);
function holderCount() external view returns (uint256);
function humanBalance(uint256 humanId) external view returns (uint256);
function initialize(bytes32 id) external;
function name() external pure returns (string);
function next(address) external view returns (address);
function night() external view returns (bytes32);
function prev(address) external view returns (address);
function recall(uint256 qty, address guest) external returns (uint256 grossPaid);
function released() external view returns (uint256);
function routerTransfer(address from, address to, uint256 amount) external;
function seedPosition(uint256 i) external view returns (int24 lower, int24 upper, uint128 liquidity, uint256 deposit);
function setHints(INightTypes.Hint[] hints) external;
function snapshotAtCutoff() external returns (uint256 amount, address first);
function snapshotBalance(address account) external view returns (uint256);
function symbol() external pure returns (string);
function totalSupply() external view returns (uint256);
function transfer(address to, uint256 amount) external returns (bool);
function transferFrom(address from, address to, uint256 amount) external returns (bool);
```

### NightVault

```solidity
function addLadderChunk(bytes32 night, uint256 fromRoom, uint256 toRoom) external;
function closed(bytes32) external view returns (bool);
function closing(bytes32) external view returns (bool);
function creditPending(bytes32 property, uint256 amount) external;
function dust(bytes32 night) external view returns (uint256);
function factory() external view returns (INightFactory);
function ladderComplete(bytes32) external view returns (bool);
function manager() external view returns (IPoolManager);
function nextRoom(bytes32) external view returns (uint256);
function openNight(bytes32 night) external;
function opened(bytes32) external view returns (bool);
function payPending(bytes32 property, address guest, uint256 requested) external returns (uint256 paid);
function pending(bytes32) external view returns (uint256);
function releaseAtCutoff(bytes32 night) external returns (uint256 usdcAmount, uint256 tokens);
function removed(bytes32, uint256) external view returns (bool);
function requiredInventory(INightTypes.NightConfig c) external pure returns (uint256 total);
function settlement() external view returns (address);
function sweep(bytes32 night) external returns (uint256 amount, uint256 hostDebtNetted);
function unlockCallback(bytes data) external returns (bytes);
function usdc() external view returns (address);
```

### NightHook

```solidity
function afterAddLiquidity(address, PoolKey, ModifyLiquidityParams, BalanceDelta, BalanceDelta, bytes) external pure returns (bytes4, BalanceDelta);
function afterDonate(address, PoolKey, uint256, uint256, bytes) external pure returns (bytes4);
function afterInitialize(address, PoolKey, uint160, int24) external pure returns (bytes4);
function afterRemoveLiquidity(address, PoolKey, ModifyLiquidityParams, BalanceDelta, BalanceDelta, bytes) external pure returns (bytes4, BalanceDelta);
function afterSwap(address sender, PoolKey key, SwapParams p, BalanceDelta delta, bytes data) external returns (bytes4, int128 feeDelta);
function beforeAddLiquidity(address sender, PoolKey key, ModifyLiquidityParams p, bytes) external returns (bytes4);
function beforeDonate(address, PoolKey, uint256, uint256, bytes) external pure returns (bytes4);
function beforeInitialize(address sender, PoolKey key, uint160 price) external returns (bytes4);
function beforeRemoveLiquidity(address sender, PoolKey key, ModifyLiquidityParams p, bytes) external returns (bytes4);
function beforeSwap(address sender, PoolKey key, SwapParams p, bytes data) external returns (bytes4, BeforeSwapDelta, uint24);
function bookingRouter() external view returns (address);
function coverFund() external view returns (address);
function distributeFee(bytes32 night, address user, uint256 notional, bool) external returns (uint256 fee, uint256 cover);
function factory() external view returns (INightFactory);
function getHookPermissions() external pure returns (Hooks.Permissions p);
function initialized(PoolId) external view returns (bool);
function manager() external view returns (IPoolManager);
function nightOf(PoolId) external view returns (bytes32);
function owner() external view returns (address);
function paused() external view returns (bool);
function platform() external view returns (address);
function rebatePool() external view returns (address);
function registry() external view returns (IHumanRegistry);
function removed(bytes32, uint256) external view returns (bool);
function seeded(bytes32, uint256) external view returns (bool);
function seededRooms(bytes32) external view returns (uint256);
function setPaused(bool value) external;
function settlement() external view returns (address);
function tradeRouter() external view returns (address);
function usdc() external view returns (address);
function vault() external view returns (address);
```

### TradeRouter

```solidity
function DOMAIN_SEPARATOR() external view returns (bytes32);
function bookingRouter() external view returns (address);
function buy(bytes32 night, uint256 qty, uint256 maxPaid, INightTypes.Ask[] asks, INightTypes.Hint[] hints, uint64 deadline) external returns (uint256 paid);
function cancelAll() external returns (uint256 newNonce);
function factory() external view returns (INightFactory);
function fillBookingAsk(INightTypes.Ask ask, address taker) external returns (uint256 gross, uint256 fee);
function filled(bytes32) external view returns (uint256);
function hook() external view returns (INightHook);
function msgSender() external view returns (address);
function nonces(address) external view returns (uint256);
function permit2() external view returns (IAllowanceTransfer);
function poolManager() external view returns (IPoolManager);
function quotePool(bytes32 night, uint256 qty, uint160 limit) external;
function rebatePool() external view returns (IRebatePool);
function registry() external view returns (IHumanRegistry);
function sell(bytes32 night, uint256 qty, uint256 minReceived, INightTypes.Hint[] hints, uint64 deadline) external returns (uint256 received);
function unlockCallback(bytes data) external returns (bytes);
function usdc() external view returns (address);
```

### BookingRouter

```solidity
function booking(bytes32 id) external view returns (INightTypes.Booking);
function bookingCount() external view returns (uint256);
function buyAndRedeem(bytes32 night, uint256 maxPrice) external returns (bytes32 bookingId, uint256 paid);
function buyAndRedeem(bytes32 night, uint256 maxPrice, INightTypes.Ask[] asks, INightTypes.Hint[] hints, uint64 deadline) external returns (bytes32 bookingId, uint256 paid);
function buyAndVoid(bytes32 night, uint256 qty, uint256 maxPaid, INightTypes.Ask[] asks, uint64 deadline) external returns (uint256 paid);
function factory() external view returns (INightFactory);
function hook() external view returns (INightHook);
function msgSender() external view returns (address);
function permit2() external view returns (IAllowanceTransfer);
function poolManager() external view returns (IPoolManager);
function quotePool(bytes32 night, uint256 qty, uint160 limit) external;
function registry() external view returns (IHumanRegistry);
function tradeRouter() external view returns (address);
function unlockCallback(bytes data) external returns (bytes);
function usdc() external view returns (address);
```

### Settlement

```solidity
function DOMAIN_SEPARATOR() external view returns (bytes32);
function attester() external view returns (address);
function bookingRouter() external view returns (IBookingRouter);
function claim(bytes32 night) external returns (uint256 paid);
function claimable(bytes32 night, address holder) external view returns (uint256);
function claimed(bytes32, address) external view returns (bool);
function consumedReport(bytes32) external view returns (bool);
function coverFund() external view returns (ICoverFund);
function cursor(bytes32) external view returns (address);
function cutoffSettled(bytes32) external view returns (bool);
function evidenceHash(bytes32) external view returns (bytes32);
function factory() external view returns (INightFactory);
function hostDebt(address) external view returns (uint256);
function incidents(address) external view returns (uint256);
function manager() external view returns (IPoolManager);
function netDebt(address host, uint256 available) external returns (uint256 netted);
function platform() external view returns (address);
function pushBatch(bytes32 night, uint256 n) external;
function rebatePool() external view returns (address);
function refundPerNight(bytes32) external view returns (uint256);
function registry() external view returns (IHumanRegistry);
function remainingHeld(bytes32) external view returns (uint256);
function remainingReserve(bytes32) external view returns (uint256);
function reportWalk(INightTypes.WalkAttestation r, bytes signature) external;
function reported(bytes32) external view returns (bool);
function setAttester(address value) external;
function settleCutoff(bytes32 night) external;
function settling(bytes32) external view returns (bool);
function unlockCallback(bytes data) external returns (bytes);
function usdc() external view returns (address);
function vault() external view returns (INightVault);
```

### CoverFund

```solidity
function balance() external view returns (uint256);
function deposit(uint256 amount) external;
function pay(address guest, uint256 amount) external;
function settlement() external view returns (address);
function usdc() external view returns (address);
```

### RebatePool

```solidity
function balance() external view returns (uint256);
function bookingRouter() external view returns (address);
function deposit(uint256 amount) external;
function factory() external view returns (INightFactory);
function manager() external view returns (IPoolManager);
function payMaker(bytes32 night, address maker, uint256 askPrice, uint256 qty) external returns (uint256 paid);
function tradeRouter() external view returns (address);
function usdc() external view returns (address);
```

### HumanRegistry

```solidity
function DOMAIN_SEPARATOR() external view returns (bytes32);
function attester() external view returns (address);
function banWalkReporter(uint256 id) external;
function consumed(bytes32) external view returns (bool);
function humanIdOf(address) external view returns (uint256);
function isOrb(address wallet) external view returns (bool);
function isVerified(address wallet) external view returns (bool);
function linkWallet(uint256 id, address wallet, uint64 deadline, bytes sig) external;
function owner() external view returns (address);
function relinkWallet(uint256 id, address wallet, uint64 deadline, bytes sig) external;
function setAttester(address value) external;
function setOrb(uint256 id, bool value) external;
function walkBanned(uint256) external view returns (bool);
```

## Mainnet safety limits

NightFactory takes immutable constructor arguments `(Deployment deps, uint256 maxF, uint256 maxPool, uint256 maxS, uint256 maxOpenNights)`. Defaults in Deploy.s.sol are `MAX_F = 1e6`, `MAX_POOL = 50e6`, `MAX_S = 100e18` and `MAX_OPEN_NIGHTS = 20`. Each has a public getter. `MAX_S` is supplied as 100 whole rooms in deployment environment configuration. Limits are checked before creating a night. Limit violations have distinct errors: `MaxFExceeded`, `MaxPoolExceeded`, `MaxSExceeded` and `MaxOpenNightsExceeded`.

`poolCost(config)` sums the rounded-up currency1 deltas across the actual buffered NightPosition positions between their tick-snapped boundaries. It excludes trading fees. This uses the same liquidity definition as seeding, rather than a continuous exponential integral. Each position rounds up to micro USDC. A night at its configured cost limit passes; one micro USDC above it fails. Position rounding and split-fill rounding still apply to individual trades.

`openNights` counts successfully opened nights, including incomplete ladders, until cutoff settlement succeeds. Only the configured Settlement can call `notifyCutoffSettled`, and the factory checks that the night exists, Settlement reports it settled and the notification has not already been consumed. The entire cutoff transaction rolls back if any later operation fails. Expired but unsettled nights still consume capacity.

## Pause matrix

The immutable hook owner controls the global hook pause and each NightToken pause. Token pause is local to its night. New opens check the global hook pause. Routers check both the global pause and the selected token pause. Token transfers involving ordinary holders check both as well. Pause controls cannot replace endpoints or withdraw reserves.

| Operation | Global hook pause | Local token pause |
| --- | --- | --- |
| Buy, sellback and ask fill | Blocked | Blocked |
| Booking and host buy-and-void | Blocked | Blocked |
| Trader transfers and router pulls | Blocked | Blocked |
| New opens | Blocked | Not applicable to a new token |
| Authorized burns | Allowed | Allowed |
| Cutoff settlement and reserve transfers | Allowed | Allowed |
| Earned sweep | Allowed | Allowed |
| pushBatch and claim | Allowed | Allowed |
| Walk payout | Allowed | Allowed |

## Deployment configuration

Deploy.s.sol checks `CHAIN_ID` and reads `POOL_MANAGER`, `USDC`, `PERMIT2`, `ATTESTER`, `PLATFORM`, `OWNER` and the four limits. OWNER controls the hook and registry; PLATFORM remains the fee recipient and Settlement attester-rotation authority. The reusable DeployLib overload accepts these separately. The shorter overload uses the safety defaults and PLATFORM as OWNER. Regression fixtures explicitly request larger price limits without changing historical test assertions.

Deploy.s.sol uses only configured external dependencies and never deploys PoolManager. It writes `deployments/<DEPLOYMENT_NAME>.json`, including ABIs from `out`, constructor configuration, chain ID, simulation block and the NightShares version 1 TradeRouter EIP-712 domain. The fork deployment uses chain ID 5042, the existing official mainnet PoolManager and Permit2, and etched MockUSDC. See README.md for commands and the distinction between simulation artifacts and confirmed broadcasts.

## Developer workflow

Run `sh script/install-deps.sh`, then `forge test --offline` from this package. Use the separate `docker-compose.chain.yml` from the app directory for network integration. Run ForkFlowTest with `FORK_RPC=http://127.0.0.1:8545` only after deployment and seed complete. Keep frozen order and attestation fields, event layouts and public compatibility selectors unchanged. Test pause with money already held and verify successful cutoff and claim fallback, rather than checking only rejected entries. Record fork block, deployed addresses and test output when refreshing integration evidence. Contracts remain unaudited.

Opening math is implemented by the immutable vault's pure `openingValues` function, using the shared NightPosition library. The factory enforces the returned cost against its immutable limit before deployment. This keeps factory runtime at 22,362 bytes without relaxing the EIP-170 code-size limit. The same library defines the public pool-cost quote and seeded positions. The completed mainnet fork verification, deployment addresses and evidence links are recorded in README.md.
