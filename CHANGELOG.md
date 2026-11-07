# Changelog

- Added persisted wallet custody adapters, Privy EIP-712 signer, Arc network configuration and additive on-chain balance fields; asynchronous PostAsk integration remains pending.
All notable changes to this monorepo. Newest first.

## Unreleased

- Add `docker-compose.testnet.yml` and `docker-compose.mainnet.yml`, copies of the deployable stack without `expose`, for separate Dokploy deployments.

- Make `docker-compose.yml` the deployable stack for Dokploy: `api` loads runtime config from `.env` (template `.env.example`), and services use `expose` instead of host ports.

- Serve factory-opened fork nights, guard draft analytics, and add an idempotent fork click-trade seed with HTTP receipt/portfolio coverage.

- Web: transaction states for trades, listings and bookings. The order box shows sending, confirmed (figures from the API result), still confirming with a safe "Check again", and failed in plain words; buy and sell send one `idempotency-key` per click and a 0.5% price limit. Bookings and trips show the shortened transaction hash with copy and a pending hotel sync. Stay pages state the 1 room x 1 night on-chain limit once the API reports it.

- Add fork-only scheduled recovery, permissionless cutoff/sweep workers, credit retries, disposable API acceptance, and guarded dev:fork startup.

- Security: Stop repayment of false walk reports, serialize claim cancellation with payouts, and remove guest identity and private claim amounts from public walk incidents.

- Add fork execution ports, deployment preflight, durable transaction recovery, native/cash provisioning and block reconciliation; reject legacy ledger settlement in fork mode.

- Match walk refunds to per-night unswept earnings and available cover funds; persist unpaid guest claims, repay them FIFO before host payouts, expose trip balances, and retain guest-ID bans.

- Add Arc fork configuration, validated deployment loading and EIP-712 domain checks, cached on-chain pause reads, persisted Anvil custody and optional mock-USDC faucet. Trade settlement remains unchanged.

- Mirror mainnet factory limits and trading pause, configure agent approval thresholds, require separate canonical Agent Pass enrollment, reject mock security with real adapters, and push cutoff payouts in batches with claim fallback.

- Agent Pass: fresh World ID OIDC checkpoints for large agent orders, atomic SQLite execution, mock failure paths and explicit IDKit fallback.

- Security: Walk bans persist across all linked World ID enrollment nullifiers and aliases, including later credential upgrades and enrollment recovery.

### Added

- Cutoff payouts: persisted entitlements, cutoff_claims escrow, Orb ClaimCutoff and ListCutoffClaims RPCs, unclaimed portfolio amounts, and claim activity. Holder payouts are pushed in batches of up to 100 per night per job tick, with ClaimCutoff as an idempotent fallback and compensation on failure.
- Host allotments are capped at 100 rooms per night and room type. Portfolio and hotel availableNow consistently show unswept earnings, with regression coverage after automatic sweeps.

- Signed trader asks: EIP-712 orders (`PrepareAsk`, signed `PostAsk`, `CancelAllAsks`) with per maker nonces, 24 hour default expiry, no escrow, and fills limited to the maker's current holding. The order encoding matches the contracts package (token base units, uint64 seconds, Keccak-256 night key). An `OrderSigner` port has a mock HMAC adapter; mock mode signs custodially when no signature is sent.
- Walk reports carry `evidenceHash` (SHA-256 of tag UID, tag counter, tap time and booking ID) and a typed `WalkAttestation` for the API attester. Reception tags keep a monotonic per tag counter.
- Web visual base: global base CSS and React primitives in `packages/design-system` (Button, IconButton, Card, Field, Input, Select, Stepper, Pill, Badge, Chip, Stat, Segmented, Tabs, Switch, Dialog, Table, EmptyState, Spinner, Skeleton, Photo, Display, Eyebrow), CSS Modules on tokens only, fonts through `next/font`, the shared app shell and nav (brand, Stay, Trade and Host switcher, section links, World ID account menu with sign out), the landing page and the World ID sign in page styled after the mock.
- Automatic per-property host payout sweeps on every job tick, net of double-sale debt, with idempotent reservations and failure compensation.
- Agent wallets with funding, withdrawals, lifetime and per-order budgets, optional night allowlists, and fresh World ID approval for orders over 1,000 USDC.
- Double-sale cover through a neutral booking report port, with reserve, pending payout and cover fund settlement, host debt, and retry-safe report handling. Failed hotel inventory pushes restore changes and return UNAVAILABLE.
- `rebate_pool` funding from late-fee excess and cutoff haircuts, with balance-capped 0.5% maker rebates for qualifying trader asks.
- JSON logs, per-IP and per-user rate limits, request body and read limits, deadlines, configurable CORS, migration-aware `/readyz`, graceful shutdown, and API/web Docker images with Compose.
- Scheduled cutoff release via `JOB_INTERVAL_MS`: cancel asks, refund holders atomically, record unsold rooms returned to the hotel, and reject trades and bookings on closed nights.
- World ID cloud verifier and web IDKit login and action verification, selected with `WORLD_ID_MODE`; mock remains the default. Structured proofs use single-use SQLite request nonces and `StartVerifyAction`.
- Chain design in `SPECS.md`: one Uniswap v4 pool per night, the host curve as a ladder of standard liquidity positions (pool does the pricing, hooks enforce policy and take fees in USDC), NightVault-owned positions and automatic host sweeps, contract list and open decisions. Chainlink CRE dropped: on chain settlement is 1:1 redemption into the pool at the pool's bid, and double sale reports come from the API attester.
- All six services implemented on mocks (identity, wallet, catalog, stay, market, host) with unit and end to end tests.
- Activity log, wallet transaction history and one time World ID action tokens as shared ports.
- Market analytics (return, APY, risk, price history, host track record) as pure functions in `market-model`.
- API server skeleton (`apps/api`): Bun with Connect, auth by per RPC access option, Swagger UI at `/docs`, mock adapters for every external system, shared night inventory, stub handlers for all six services.
- Service contracts (`packages/proto`): identity, catalog, stay, market, host and wallet, 43 RPCs, with generated TypeScript, Connect Query helpers and OpenAPI 3.1.
- Market model (`packages/market-model`): TypeScript port of the mock pricing model with parity tests against the original.
- Design tokens (`packages/design-system`) from the mock v2 styles, light and dark.
- Coding standards and platform spec.

### Changed

- Web fallbacks: a shared sign in gate (purpose, what you get, World ID level and a browse link), error panels in plain words with retry and a way back, page shaped skeletons, and per app `error.tsx` and `not-found.tsx` across Stay, Trade and Host. Queries no longer retry errors a retry cannot fix, and My trips shows the gate instead of jumping to sign in.
- Market model synced to `53a8f129bd65`: ladder boundaries snap down to the Uniswap v4 tick grid using the raw USDC/NightToken decimal ratio; parity, quote expectations and ladder examples are re-pinned.

- Web UI consolidated into `@night-shares/design-system`: new `Kpis`, `Icon`, `BackLink` and `Alert` primitives; `Segmented` takes number values and trade sizes, `Button` gains `text`, `Badge` gains `warn`, `Pill` gains status dots and a small size, `EmptyState` gains `plain`. Stay, Host and Trade use them instead of local copies. `AppShell` adds `layout` (`column`, `bleed`, `free`) and a transparent hero nav, so the Stay hero is full bleed without negative margins and Trade uses the shell too.
- World ID 4.0: IDKit 4.6.0, server signed `rp_context`, proofs verified at `/api/v4/verify/{rp_id}`. Stay trust moments use Selfie Check and Trade, Host and agent approvals use Proof of Human. `humanId` is the uniqueness nullifier of the fixed enrollment action `night-shares-enroll`, stable across re-login and session resets; session IDs only link returning logins, and a Selfie to Orb upgrade keeps one user. Per action proofs (`check_in:<bookingId>`, `approve_agent_order:<orderId>`) are one time and bound to their booking or order. The mock client can simulate cancel and reject.
- Every NightToken quantity is a whole tenth of a room night: a shared guard converts model floats to integer tenths (tolerating float drift only), buys, sells, quotes, agent orders, partial fills, recall, cutoff and openings reject or floor non tenth amounts, and migration 340 makes SQLite reject fractional positions and ask sizes.
- `GetPriceCalendar` returns every night in the window; sold out or closed nights carry `is_sold_out` instead of failing the whole request.
- Opened nights fix price, curve and room count; all rooms are recorded under `NightVault`.
- Market model synced to `3d84c7b5d2cb`: guest recall uses actual trader holdings, largest holder first; `CAP_HUMAN` applies a 30% cap on every night across all wallets a human controls, including agents.
- Hosts trade under the same rules, pay the full fee on their own nights, and route their host fee share to `rebate_pool`. Host holdings are public and host sell backs appear in analytics.
- Cutoff payouts use `cutoffRefund`: holders receive 70% of their pro-rata held reserve and the 30% haircut funds `rebate_pool`.
- Host bond and security hold removed (mock model.js 4b697be65422). A cover fund takes 0.1% of each trade's notional out of the existing fee, paid to the `cover_fund` address; user totals are unchanged. `market-model` adds `offlineSaleCover`, the double sale waterfall (reserve slice, pending payouts, cover fund). Removed proto fields are reserved.
- Design tokens re-synced with the latest mock CSS: a trade theme scoped to `[data-app="trade"]` (light and dark), command palette and app switcher tokens, and breakpoints md 860 and lg 1100. Dark `--warn` now matches the mock (`#B87A0A`).
- Market model, in both mock and port: guests never pay above the recall cap, distant nights never show negative inventory, rooms split exactly across room types, trader ask and recall fills charge the seller fee, and recall markups below 5% are rejected.

### Removed

- Host `StopSelling` and `Withdraw` RPCs and controls; removed protobuf fields are reserved. Automatic sweeps replace manual host payouts.
- Reserved guest tranche, guest-only pool slices and `CAP_PEAK`; guests use recall and every night uses `CAP_HUMAN`.
- `unsoldRefund` and `REFUND_AT_FAIR`; cutoff refunds no longer depend on parked ask prices.

### Security

- `IssueReceptionTag` is disabled unless `DEV_TAG_ISSUER=true`, which requires `ADAPTERS=mock`, so guests cannot mint their own proof of presence.
- Host fee routing requires nonempty owner and human identities; empty identities cannot match a host. Host night recall previews are bounded by trader holdings.
- Rate-limit eviction preserves throttled buckets, removes stale or fully refilled entries first, and shares a bounded overflow bucket when full. Identity IP quotas group IPv6 by /48; general IP quotas use /64.
- Forwarded addresses require `TRUST_PROXY=true` and a socket peer in `TRUSTED_PROXIES`; `TRUSTED_PROXY_HOPS` selects from the right. No proxies are trusted by default, preventing spoofed quota bypass.
- Early HTTP rejections close the socket after the response, preventing unread request framing from breaking subsequent requests with `HPE_INTERNAL` and 400 responses.
- Host ownership: only a property's owner can open its nights; automatic payouts go to that owner and are tracked per property.
- Payments settle all or nothing, and inventory and positions are reverted when settlement fails, so parallel requests cannot buy without paying or drain the pool.
- World ID subject and per action nullifier are kept apart.
- Session tokens are 256 bit random values stored only as SHA-256 hashes.
