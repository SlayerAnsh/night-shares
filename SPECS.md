# Night Shares platform spec

Night Shares turns hotel room nights into tradable units. Hosts offer nights, traders buy and sell them before the stay, guests book them through a normal checkout. Everyone signs in with World ID. Payments currently settle through a mock USDC ledger; Arc settlement is planned.

This document describes the backend and shared packages. The behaviour mirrors the approved static mock in `../mock/v2` (see its `README.md` and `assets/model.js`). When the mock changes its market model, `packages/market-model` is re-synced and this spec is updated.

Coding rules live in `STANDARDS.md`.

## Goals

- End to end flows work on mocks from day one: sign in, search, quote, book, check in, trade, open nights, payout.
- Every external system sits behind a port with a mock adapter, so each can be replaced by a real one without touching business logic.
- Protobuf is the single contract. Types, Connect clients, React Query hooks and OpenAPI docs are generated from it.

## Non-goals (for now)

- Visual design of the web app. The Next.js app is built logic first; styling follows the approved mock.
- Real chain and real channel manager adapters. The chain design is recorded below so the adapters have a target. World ID cloud verification is available, with mock mode still the default.

## Layout

```
app/
  package.json            workspace scripts (pnpm)
  pnpm-workspace.yaml
  biome.json
  STANDARDS.md  SPECS.md  DEVELOPER.md  CHANGELOG.md
  apps/
    api/                  Bun + Connect server
    web/                  Next.js Stay, Trade and Host app
  packages/
    tsconfig/             shared tsconfig presets
    proto/                .proto sources, buf config, generated code and OpenAPI
    market-model/         pure pricing and book math (port of mock/v2/assets/model.js)
    design-system/        tokens, global base CSS and React primitives shared by all web apps
```

## packages/proto

```
proto/night_shares/
  auth/v1/access.proto         method option: PUBLIC | DEVICE | ORB
  common/v1/money.proto        Usdc { int64 micros }
  common/v1/night.proto        NightKey, RoomNights { int32 tenths }
  identity/v1/identity.proto
  catalog/v1/catalog.proto
  stay/v1/stay.proto
  market/v1/market.proto
  host/v1/host.proto
  wallet/v1/wallet.proto
```

Generation (`buf generate`):

| Plugin | Output | Used by |
| --- | --- | --- |
| `protoc-gen-es` (v2) | messages and service descriptors | api, web |
| `protoc-gen-connect-query` | React Query hooks helpers | web |
| `protoc-gen-connect-openapi` | one OpenAPI 3.1 file per service | api `/docs`, humans |

Generated code goes to `packages/proto/gen` and is not edited by hand. The package exports it as `@night-shares/proto`.

## Services

Auth column: the `access` option on each RPC.

### identity.v1.IdentityService

| RPC | Access | Purpose |
| --- | --- | --- |
| StartSignIn | PUBLIC | Begin a World ID request. In: level (DEVICE or ORB). Out: request id, QR payload, expiry |
| CompleteSignIn | PUBLIC | Submit the World ID proof. Out: session token, user (human id, level, wallet address) |
| GetSession | DEVICE | Current user |
| SignOut | DEVICE | End session |
| StartVerifyAction | DEVICE | Begin a purpose-bound World ID request for a sensitive action |
| VerifyAction | DEVICE | Complete a fresh check for check-in or an agent order over 1,000 USDC. Out: verification token |

`humanId` is the normalized decimal uniqueness nullifier of the fixed World ID enrollment action, never a session ID or session nullifier. Night Shares never receives a name or photo. Sign in creates or links a USDC wallet through `WalletProvider`.

### catalog.v1.CatalogService

| RPC | Access | Purpose |
| --- | --- | --- |
| ListDestinations | PUBLIC | Autocomplete. In: text. Out: city, country, stay count, from price |
| SearchStays | PUBLIC | In: destination, type, sort, check in, check out, adults, kids, rooms. Out: stay cards with total, average, deal flag |
| GetProperty | PUBLIC | Property, room types, amenities, photos |

### stay.v1.StayService

| RPC | Access | Purpose |
| --- | --- | --- |
| GetPriceCalendar | PUBLIC | Per night guest price for a room type over a date range |
| QuoteStay | PUBLIC | Total, fee, per night rows, price source (hotel, trader, recall cap), usual rate |
| LockQuote | DEVICE | Hold a quote for 10 minutes. Out: lock id, expiry |
| CreateBooking | DEVICE | In: lock id, guest name and email (sent only to the hotel), pay method (USDC or CARD). Buys 1.0 room night per room per night through `routeBuy(guest)`, burns it, pushes the reservation to the hotel. Out: trip |
| ListTrips | DEVICE | Upcoming and past trips |
| CheckIn | DEVICE | In: trip id, verification token from VerifyAction. Marks the stay confirmed |
| GetReceipt | DEVICE | Receipt for a trip |
| ToggleSave / ListSaves | DEVICE | Saved stays |

### market.v1.MarketService

Every NightToken quantity is a whole tenth of a room night; the API rejects fractional tenths and validates model quantities before quoting, storing or settling them.

| RPC | Access | Purpose |
| --- | --- | --- |
| Discover | PUBLIC | Night cards for the next 75 nights. Filters: city, sort (return, risk), value only, soon, watchlist |
| GetNight | PUBLIC | Night detail: fair price, stats, risk, price history, host track record, month calendar |
| GetBook | PUBLIC | Unified book: asks (pool slices and trader asks, host holdings flagged), sell back bids with late fee, recall cap, fair price |
| ListTape | PUBLIC | Last 40 prints |
| QuoteBuy / QuoteSell | PUBLIC | Route preview: fills, average, fee, cap used, late fee, cutoff refund |
| Buy | ORB | Execute a buy. Enforces the combined per-human cap across controlled wallets |
| Sell | ORB | Sell back to the pool with late fee |
| PrepareAsk | ORB | Return order fields, EIP-712 typed data JSON and digest for the caller's current maker nonce |
| PostAsk / CancelAsk | ORB | Sign and list an off chain ask without escrow, or cancel one listing. Warns past 2 times fair price or above recall cap |
| CancelAllAsks | ORB | Increment the caller wallet's nonce and cancel all its open asks |
| GetPortfolio | ORB | Holdings, listings, realised and unrealised P&L, track record, additive unclaimed cutoff amount |
| ClaimCutoff | ORB | Pay the caller's snapshot from cutoff_claims once; repeats return already_claimed |
| ListCutoffClaims | ORB | Caller entitlements with night, size, amount and optional claimed_at |
| ToggleWatch / ListWatch | ORB | Watchlist |
| GetAgentWallet / FundAgentWallet / WithdrawAgentWallet | ORB | Read, fund or withdraw the separate agent ledger balance |
| SetAgentBudget | ORB | Set lifetime and per-order spend caps and an optional night allowlist |
| CreateAgentOrder / ApproveAgentOrder | ORB | Agent wallet orders. Orders over 1,000 USDC need a VerifyAction token |

Trader asks use EIP-712 domain `NightShares`, version `1`, with chain ID and verifying contract from configuration. `Order` fields are `night:bytes32`, `size:uint256` (NightToken base units, tenths times 1e17), `price:uint256` (micro USDC per whole room night), `expiry:uint64` (Unix seconds; the API rounds expiry down to whole seconds), `nonce:uint256`, and `maker:address`. A fill costs `ceil(size * price / 1e18)` micro USDC; the taker pays it and the maker receives the same gross amount, with fees separate. `night` is Keccak-256 of the UTF-8 NightKey ID `<propertyId>:<roomTypeId>:<date>`. Typed data JSON encodes integers as decimal strings. Expiry defaults to 24 hours and must be in the future, at most seven days away. `PrepareAsk` returns the same fields carried by `Ask`; explicit `PostAsk` signatures must include the prepared expiry and nonce. Empty signatures are signed custodially only with mock adapters.

SQLite migration 330 stores per-wallet nonces in `market_maker_nonces` and signed ask metadata and remaining quantities in `market_signed_asks`. Posting leaves tokens available for sells and recall. Every trader, guest and agent fill checks current maker holdings, limits execution to available tenths, skips invalid orders, and retains existing model cap and maker rebate rules. Book, discovery and quote reads exclude expired and stale orders without waiting for the expiry job. Reservation and position updates share one synchronous SQLite transaction; wallet settlement follows, with synchronous compensation on failure. Seeded mock market-maker inventory retains its existing simulation behavior. Chain execution remains mock.

Cutoff snapshots each human holder's entitlement using the existing per-night refund and integer tenths, moves their total from pool to cutoff_claims in one settlement, clears positions and records cutoff_claimable activity. The haircut still funds rebate_pool; seeded market-maker remainder is paid automatically. Claims stay unrealised until ClaimCutoff settles and records cutoff_claimed. Failed release or claim settlements compensate synchronously for retry. Migration 360 persists snapshots and claim status.

### host.v1.HostService

| RPC | Access | Purpose |
| --- | --- | --- |
| ConnectChannelManager | ORB | In: property, PMS (Mews, Cloudbeds, SiteMinder). Imports room types and usual rates |
| GetPortfolio | ORB | All hotels: KPIs, alerts, 8 week occupancy |
| GetHotel | ORB | One hotel: KPIs, month glance, price series, calendar |
| PreviewOpenNights | ORB | Floor, last room price, guest price cap, minimum payout, slots, kept |
| OpenNights | ORB | In: dates, room types, allotment percent, demand preset, release policy. All S tokens mint into NightVault-owned pool positions. F, k and S are fixed after open |
| GetNight | ORB | Per room type state, activity, release timeline, payout split |
| GetPayout | ORB | Available earnings, held for traders, fees, swept total and last sweep |
| Automatic sweep | Job | Send earned USDC, net of host debt, to the owner wallet on each tick. GetPayout shows totals and the last sweep |

Host openings and allotment edits reject S above MAX_S = 100 rooms per night and room type with INVALID_ARGUMENT. Portfolio and hotel availableNow both mean earned USDC not yet swept, net of debt, matching the next automatic sweep. Swept totals remain separate payout fields.

### wallet.v1.WalletService

| RPC | Access | Purpose |
| --- | --- | --- |
| GetBalance | DEVICE | USDC balance |
| ListTransactions | DEVICE | Ledger entries for the user |

## apps/api

```
apps/api/src/
  main.ts                 boot: load config, build container, start server
  config/                 env parsing (ADAPTERS=mock by default, PORT)
  server/
    create-server.ts      node:http + connectNodeAdapter, CORS, limits, /docs, /healthz, /readyz
    routes.ts             registers every service handler
    interceptors/         auth (reads the access option), errors
    docs/                 serves OpenAPI files and a Swagger UI page
  container/              composition root: picks adapters, builds services
  db/                     SQLite migrations and transactions
  jobs/                   cutoff release, double-sale polling, host sweeps
  shared/                 DomainError, money helpers, ids, dates
  ports/                  cross domain ports (one folder per port)
    clock/  ids/  identity-verifier/  wallet-provider/  onramp/  channel-manager/  booking-report/
      <port>.ts           interface
      <port>.mock.ts      mock adapter
  modules/<domain>/       identity, catalog, stay, market, host, wallet, double-sale
    <domain>.handler.ts   proto <-> use case
    mappers/
    use-cases/            one file per use case, each with a test
    repo/                 repository interface and SQLite implementation
  seed/                   the six mock properties and their room types
apps/api/test/e2e/        full flows through the generated Connect client
```

### Ports and their mocks

| Port | Local behaviour | Production integration |
| --- | --- | --- |
| `Clock` | settable time | system clock |
| `IdGenerator` | counter based, prefixed | random ids |
| `IdentityVerifier` | `mock:<seed>:orb` or `mock:<seed>:device` proofs with single-use requests and a stable subject per seed | World ID cloud verify available through `WORLD_ID_MODE=cloud` |
| `WalletProvider` | creates a fake address, keeps mock balances in SQLite, seeds 12,480 USDC | Arc USDC |
| `Onramp` | card charge always succeeds, converts 1:1 | card onramp |
| `ChannelManager` | returns room types and usual rates from seed, accepts reservation push and returns a hotel reference | Mews, Cloudbeds, SiteMinder |
| `SessionStore` | 256 bit random tokens, stored by SHA-256 hash in SQLite | SQLite |
| `ActivityLog` | SQLite night events for bookings, trades, asks, host changes and jobs | SQLite |
| `VerificationStore` | One-time SQLite action tokens, five-minute expiry, bound to user and action | SQLite |
| `BookingReport` | Pollable mock reports with stable IDs | Attester or CRE adapter later |

The identity port separates the enrollment `subject` (used as `humanId`) from each proof's `nullifier`. IDKit 4.6.0 requests use backend-signed RP contexts, five-minute single-use request nonces, and complete-result JSON transport. The cloud adapter forwards each complete IDKit result unchanged to `POST /api/v4/verify/{rp_id}` and checks the configured environment, nonce, action, credential and signal. Mock remains the default and preserves existing seeded identifiers, with additional session and action-nullifier semantics.

Enrollment uses the fixed `WORLD_ID_ENROLL_ACTION` (default `night-shares-enroll`) with `session_id: "create"`. Verified 256-bit nullifiers are stored as canonical unsigned decimal strings. Re-enrollment of an existing nullifier recovers the same human and adds the newly verified session to linked sessions; it never replaces previous sessions. Returning login proves the saved `session_id` using a fresh signed context without an action. A session ID is a continuity handle, not a uniqueness key. Session nullifier pairs are replay protection only. Browser storage retains a session handle per tier; application bearer tokens remain httpOnly cookies.

World documentation guarantees action-scoped uniqueness for the same human, app and action, but does not promise identical nullifiers across Selfie and Orb credentials. The implementation does not assume equality. An authenticated Selfie account can link a new Orb enrollment with the same enrollment action. Its canonical `humanId` then becomes the Orb enrollment nullifier; user ID, wallet, linked sessions, aliases and walk bans are retained. This is a credential upgrade, not a login or session-reset identity rotation. Re-login and session recovery never change the canonical key. Conflicting existing Orb accounts cannot be silently merged. Trade requires an Orb session, so its 30% cap uses the Orb canonical key. A Selfie proof never creates an Orb application session merely because the account has an Orb alias.

Sensitive action requests carry a booking or order `resource_id`, yielding `check_in:<bookingId>` or `approve_agent_order:<orderId>`. SQLite uniquely stores `(action, nullifier)`. Because action nullifiers cannot identify an account, cloud action verification additionally requires a proof of the account's saved World ID session. Both complete results are verified server-side before issuing a one-time application token. The action proof establishes action uniqueness; the session proof authorizes the signed-in account. The two proofs do not establish cross-credential nullifier equality. Cloud requests without a resource ID fail closed. Callers and token consumers must carry the same resource ID for end-to-end resource binding; integration of those out-of-scope consumers remains required.

`WORLD_ID_ALLOW_LEGACY=true` is a temporary hackathon policy for Orb uniqueness actions. Session creation, enrollment with session creation, and returning login require v4 and always disable legacy proofs. The simulator uses `WORLD_ID_ENVIRONMENT=staging`; production must explicitly select `production`. Deprecated `deviceLegacy` is never requested.

### World ID credential choice by trust moment

Stay booking uses ACCESS_DEVICE mapped to `selfieCheck`. Camera liveness and facial similarity provide medium assurance with low friction, sufficient for a booking flow without tradable ownership. This is not Orb-level global uniqueness.

Reception tap uses ACCESS_DEVICE mapped to `selfieCheck`. The authenticated guest identity combines with the separate reception tag proof of presence; requiring Orb would add friction without proving physical presence at the hotel.

Walk reporting uses ACCESS_DEVICE mapped to `selfieCheck`. Booking ownership and a verified reception tap constrain reports; false-report bans follow the canonical enrollment identity through session resets and credential upgrades. Selfie remains medium assurance, so the stronger one-human guarantee of an Orb-backed ban applies once the identity has Orb enrollment.

Trading uses ACCESS_ORB mapped to `proofOfHuman`. Orb-backed unique humanity is necessary for the 30% per-human cap and prevents new sessions from creating new trading identities.

Host ownership uses ACCESS_ORB mapped to `proofOfHuman`. Orb-backed identity is appropriate for control of inventory and durable suspension after walk incidents. Host ownership remains linked to the same user and canonical human across session recovery.

Agent approvals over 1,000 USDC use ACCESS_ORB mapped to `proofOfHuman`, plus per-order uniqueness and session continuity. The amount and delegated trading authority justify a fresh check with the strongest required identity assurance. Orb sessions also satisfy ACCESS_DEVICE; proto enum names remain unchanged.

Sources: [IDKit integration](https://docs.world.org/world-id/idkit/integrate), [session proofs](https://docs.world.org/world-id/idkit/session-proofs), [credential configuration](https://docs.world.org/world-id/idkit/credentials), and [error codes](https://docs.world.org/world-id/idkit/error-codes).

### Money

Every payment goes through `WalletProvider.settle(legs)`, which applies all legs or none. Money paths reserve their inventory, positions, budgets or payout and debt state synchronously in SQLite before settlement, then compensate reservations if settlement fails. A real Arc adapter maps `settle` to one multi transfer transaction.

### Host ownership

Each property has one owner. The four seeded connected hotels (Velana, Ubud, Rive, Alpen) belong to the demo host, who signs in with the mock proof `mock:host:orb`. Other hosts start with no hotels and can claim only unowned properties (Salinas, Machiya) through `ConnectChannelManager`. Every host RPC checks ownership, and automatic sweeps are tracked per property. Earned USDC (R minus L) is swept to the owner wallet after netting outstanding host debt. Sweep records and reservations prevent duplicate payments; failed settlement compensates both payout and debt reservations. Hosts cannot stop selling or manually withdraw after opening. F, k and S are fixed; unopened nights remain editable.

### Market state

Night state (allotment, pool position `q`, booked, held, trader asks) lives in the market repository. SQLite persists it across restarts; initial state is seeded from `nightState` in `market-model`. Buys, sells, bookings and scheduled jobs update it.

Hosts lock nothing beyond the traded nights themselves. There is no bond or security hold. A cover fund receives 0.1% of each trade's notional from the existing fee, leaving the 1.3% total unchanged. The cover fund backs walked guest payouts only. Booking owners report a refused stay through the neutral booking report flow, with host debt netted by automatic sweeps; see Walked guest below.

The model is pinned to `3d84c7b5d2cb`. `CAP_HUMAN` is 30% on every night, with `capOf(S) = max(1, 0.3 * S)`. The cap combines all wallets controlled by the human, including the agent wallet. There is no reserved guest tranche or guest-only pool slice. Guests fill pool and trader asks at or below the recall strike, then recall remaining trader holdings, largest holder first. Recalled holders receive the strike less 1.3%. Recall is capped by actual holdings remaining after ask fills, including in host night previews; exhausted supply is sold out.

Hosts may trade their own nights under the same cap and full fee. Their 1% host fee share routes to `rebate_pool` on their own trades. Public night and book views expose host holdings and analytics flag host sell backs. Host identity matching requires nonempty owner and human identifiers.

`rebate_pool` receives the late sell-back fee above the base fee, the 30% cutoff haircut and host self-trade fee shares. A trader ask at or below 105% of the pool price earns a 0.5% notional maker rebate, capped by available pool balance and paid in the same settlement. Cheaper asks qualify too.

At cutoff, the release job cancels asks, clears holder positions and pays `cutoffRefund` atomically. Holders share 70% of the held reserve pro rata; 30% funds `rebate_pool`. The job records unbooked rooms as returned to the hotel. Failed settlements restore state for retry; completed releases cannot pay twice. Closed nights reject trades and bookings. This replaces the parked-ask `unsoldRefund` rule and `REFUND_AT_FAIR`. Background order flow simulation remains future work.

### Operations and jobs

The API provides JSON logs, per-process IP and user quotas, body and Connect read limits, request deadlines and configured CORS origins. Forwarded IPs require both `TRUST_PROXY=true` and an explicitly trusted socket peer; `TRUSTED_PROXY_HOPS` selects the address from the right. General IPv6 quotas group /64 prefixes and identity quotas group /48. Bucket eviction preserves throttled clients, with a shared overflow bucket when no safe eviction is possible. Early rejections close the socket after responding so unread framing cannot corrupt a later request.

`/healthz` is liveness; `/readyz` checks SQLite access and applied migrations. The scheduler runs cutoff release, double-sale polling and host sweeps in that order every `JOB_INTERVAL_MS` (default 60000). Tests drive its `tick()` hook with a mock clock. Shutdown drains requests and jobs before closing SQLite, subject to `SHUTDOWN_TIMEOUT_MS`. API and web Dockerfiles and Compose are available; configuration and commands are in `DEVELOPER.md`.

### Agent wallets

Each Orb user has one mock agent ledger address, `agent:<userWallet>`, created lazily with zero balance. GetAgentWallet returns it. FundAgentWallet transfers the user's USDC to it with memo `agent_funding:agent`, wallet transaction kind AGENT_FUNDING (10), and activity `agent_wallet_funded`. WithdrawAgentWallet returns available funds to the user's wallet. Neither action resets spending. All transfers remain mock ledger settlements.

SetAgentBudget sets a lifetime total spend cap and a per-order cap in bigint micro USDC. Both start at zero. An optional exact night allowlist uses `propertyId:roomTypeId:date`; empty allows all nights. This is the minimal night filter corresponding to the mock's hotel, room and date rules. Raising the total authorizes additional spending. Lowering it below already reserved or spent USDC fails. Zero pauses new orders.

Every agent order pays from its agent address and checks actual quoted total, including fees, against its order budget, per-order cap and remaining total budget. Violations return FAILED_PRECONDITION. Inventory, the shared human position and budget spending are reserved synchronously in one SQLite transaction before wallet settlement. Settlement failure compensates all three synchronously. Concurrent requests share the human's order lock. Orders over 1,000 USDC stay pending until a user-bound VerifyAction token approves them. Approval rechecks current prices and budget. Successful fills append `agent_order_filled`.

Portfolio includes agent balance, budget, spent total and agent purchase attribution. Holdings remain in the human's shared position, preserving the combined per-night cap and existing sale and cutoff behavior. Agent attribution is capped at the remaining human holding for each night, using executed agent purchase quantities. It is not a separate custody position or a realized cost basis. Sales and cutoff refunds follow the shared human position; lifetime spending does not reset after a sale or withdrawal.

### Agent Pass

Agent Pass is the default human checkpoint for agent orders over 1,000 USDC. This supersedes the IDKit approval descriptions above unless `AGENT_APPROVAL=idkit` explicitly selects the fallback. `AGENT_PASS_MODE=mock` is the local default; `oidc` uses the official World ID issuer, discovery and authorization code flow. The existing Orb application session remains required.

The user reviews the order and selects “Approve with World ID”. `StartAgentCheckpoint(order_id)` (ORB) saves the exact order, night, size, maximum total, wallet budget caps, allowlist and ten-minute expiry in SQLite migration 380. It explicitly permits first identity enrollment only when the account is unlinked. Fresh state, nonce and PKCE verifier belong to this attempt. A one-use API handoff sets an HttpOnly SameSite=Lax browser cookie and binds it to the live initiating application session before redirecting to World ID. No session token or client secret goes in a URL.

The backend requests `scope=openid`, authorization code, PKCE S256, `max_age=0`, `prompt=login`, and essential `claims.id_token.acr` equal to `https://world.org/oidc/acr/orb`. Token redemption uses `client_secret_basic` at the discovered endpoint, once per attempt. `jose` validates RS256 signatures with discovery JWKS, issuer, audience, expiration, nonce and required claims. The backend checks the exact ACR, proof or passkey AMR and `auth_time` against the attempt start and current time with five seconds of skew. Expired attempts and ID tokens have no grace period. The callback also checks state, browser binding, live session, owning user and any response issuer.

`GET /agent-pass/callback` resumes only after validation. First success links the exact `(iss, sub)` to the application user, provided that identity is not assigned elsewhere. Later success must match that pair. The backend rechecks the saved action, budget policy, current prices, spend limits, cap and expiry. In the current SQLite mock ledger, identity enrollment, inventory, positions, all settlement legs, order execution and attempt status `used` commit in one synchronous transaction. No database transaction crosses an OIDC network await. Failed settlement rolls back every protected write. A future remote wallet adapter needs an outbox and external settlement reconciliation before it can replace this atomic path.

Pending, approved, denied, cancelled, expired and used are stored statuses. Approved is transient inside the execution transaction. Denial, cancellation, expiry, account or snapshot mismatch, unsupported authentication and dependency failure never execute the order. Redemption is claimed before network I/O; rejected or interrupted redemption cannot be retried with the same attempt. Replayed or concurrent callbacks cannot execute twice. Pending orders can start a new checkpoint after failure. `GetAgentCheckpoint(attempt_id)` (ORB) exposes only status, reason and order ID to its owner. Callback redirects to `${WEB_ORIGIN}/trade/portfolio?checkpoint=<status>`; the web confirms status through this authenticated RPC and displays the refreshed order.

Trust: Orb class provides the stronger account uniqueness assurance appropriate for delegated spending. `max_age=0` requires authentication belonging to this new attempt, not a literally zero-second age after the browser round trip. Orb class can be satisfied by an enrolled passkey; it does not promise a new Orb scan or Face Auth. World ID authenticates the human, while this application's saved action and permission checks authorize the purchase. Pairwise OIDC subjects are not IDKit nullifiers. Mock authentication and sandbox identities do not establish production humanness, and their databases must remain separate from production.

## apps/web

One Next.js (App Router) app. Stay, Host and Trade are separate product areas, each in its own route group with its own URL prefix and layout. They share one World ID session, like the mock. Visual design follows the approved mock: CSS Modules next to each component, using only design tokens, with shared primitives from `@night-shares/design-system` (see its README). No Tailwind, no CSS in JS.

```
apps/web/
  app/
    layout.tsx                 root: tokens.css, base.css, next/font families, Providers (React Query, Connect transport, session)
    page.tsx                   landing: hero, three doors (Stay, Host, Trade), how a night moves
    login/page.tsx             World ID sign in; honours ?next=&why=&need= (why: trade, host, book, portfolio, watchlist, continue; need: orb or device)
    rpc/[...path]/route.ts     proxy to the API; adds Authorization from the session cookie
    (stay)/stay/...            Stay app: search, stay detail, checkout, trips
    (trade)/trade/...          Trade app: discover, night, portfolio
    (host)/host/...            Host app: portfolio, hotel, night, payout (whole area needs Orb)
  src/
    providers/                 query client, transport, session provider
    session/                   cookie, server actions (complete sign in, sign out), useSession, guards
    world-id/                  WorldIdClient port, mock adapter (QR plus Simulate scan), IDKit adapter for configured World ID mode
    features/<app>/            hooks and small components per app, grouped by screen
    shared/                    formatting (USDC micros, tenths, dates), fonts, nav (brand, app switcher, account menu), shell (AppShell per app)
    landing/                   landing page sections
```

### Session

- Sign in: the login page calls `StartSignIn` through the proxy, shows the QR, and on scan (simulated in the mock) calls a server action that runs `CompleteSignIn` on the server and stores the session token in an httpOnly, SameSite=Lax cookie. The token is never readable by browser JavaScript.
- Every Connect call from the browser goes to `/rpc/<service>/<method>` on the Next app. The route handler forwards it to `API_URL` (default http://localhost:8787) with `Authorization: Bearer <cookie token>`.
- Server components may call the API directly with the same cookie.
- A gated action calls `requireAccess(why, need)`: signed out or below the needed level sends the user to `/login?next=<current url>&why=..&need=..`, then back. Mirrors `NSAuth.require` in the mock.
- `next` is accepted only as a same site relative path.

### Access by area

| Area | Public | Device | Orb |
| --- | --- | --- | --- |
| Stay | search, stay pages, prices | book, saves, trips, check in | |
| Trade | discover, night views | | buy, sell, asks, watchlist, portfolio, agent |
| Host | | | everything |

### Data

Data access uses the generated Connect Query hooks only (`@connectrpc/connect-query` with the `_connectquery` exports from `@night-shares/proto`). Money is formatted from bigint micros, quantities from tenths, in `src/shared`.

## Chain design (Arc, Uniswap v4)

Status: design only. No contracts exist yet. When `WalletProvider` gets a real Arc adapter, its `settle` legs map onto the contracts below.

### Decided

- Hosts lock nothing beyond the traded nights (see Market state above). No bond.
- The Uniswap v4 pool prices every trade with standard concentrated liquidity math. Hooks enforce policy and take fees. They never replace the pool's pricing (no custom curve through `beforeSwapReturnDelta`).
- No Chainlink CRE in this build; CRE is a later upgrade for the walked guest report only. The report source sits behind a neutral port, so swapping the API attester for a CRE workflow does not touch the contracts' rules or the pricing. The four oracle jobs move off chain or into the pool:
  - Price: every on chain settlement uses the pool's own price, by redeeming the token into the pool. P* stays an off chain guide for the UI and agents, clamped by the host's usual rate from the channel manager. No ADR feed.
  - Double sale: no detection. An offline double sale only harms a guest who is then turned away, so the guest reports it (walked guest rule below). A double sale nobody books harms no one: the holder is redeemed at cutoff as usual. Booking honoured and occupancy come from the `ChannelManager` port and World ID check ins. Only walked guest reports reach the chain; the API's attester key signs them for `Settlement`. This is a trusted operator, the same trust as `HumanRegistry`, and is stated in the README.
- The host has no control over a night's tokens once it opens. All S tokens are minted into the pool at open as positions owned by `NightVault`, a contract with no admin. F, k and S cannot change after open. Earned USDC (below P(b)) is paid to the host's payout address automatically; anyone may trigger the sweep, but the money can only go to the host. There is no stop selling.
- The host trades like anyone else. To take rooms back it buys through the pool and burns them. On its own trades it pays the full 1.3% (its 1% host share goes to `RebatePool`), its holdings are shown on every night page, and the per human cap counts all its wallets as one human. It may sell back; analytics flags nights where the owner trades. Taking rooms back is cheap before traders hold any (only the fee) and costly after, because every buy lifts the price under all held tokens: for F 6,000, k 1.2, S 15, buying back 3 rooms costs 264.38 at q 0, 427.25 at q 6 with nothing held, 9,427.15 at q 6 with 4 held (ladder math).
- Per human cap: 30% of S on every night (`CAP_HUMAN`, `capOf(S)`), not only peak nights.
- Guests come first through callable holdings, not a guest tranche. There is no guest only share. A guest's buy fills from the pool and trader asks at or under the recall strike X; anything left is taken from trader holdings at X (the holder gets X minus 1.3%), largest holder first. Only guests can recall. If nothing is left in the pool, in asks or in holdings, the night is sold out. A trader's upside on a night is therefore capped at X.
- Walked guest rule (replaces double sale detection and the `offlineSaleCover` waterfall). A guest who booked and was not let in reports it within 24 hours of check in time. The report counts only if the guest tapped the Night Shares tag at reception (proof they were there) and no World ID check in exists for the booking; the desk check in is the host's defense. The guest gets a 100% refund of what they paid, from the host's pending payouts, then `CoverFund` as host debt netted from future payouts (`walkPayout`). There is no extra money penalty, because a multiple would expose hosts to scams. The penalty is reputation: each walk is a public incident on the host's record, and 2 incidents stop the host opening new nights. (`WALK_MULTIPLE` = 1; the model constant changes from 2 to 1 in the next batched `model.js` edit.) False reporters lose their World ID access to Night Shares, which is permanent because World ID is one per human. Known weak spot: the reception tag is in the host's building; a missing tag is itself reported and reviewed by the platform.
- Quotes use ladder math. `market-model` prices on the same one position per room ladder as the chain, so a quote matches the on chain fill to the micro USDC. The exponential stays the ideal curve in the pitch.
- Trader asks and agent quotes are EIP-712 signed orders `{night, size, price, expiry, nonce, maker}`, held off chain by the API order book. Tokens stay in the maker's wallet until a fill, so recall still works and the pool holds only `NightVault` liquidity. `TradeRouter` and `BookingRouter` fill any validly signed order from anyone (the API helps people find orders but cannot block a fill), move the maker's tokens without an allowance (only the two immutable routers may, and only inside a fill whose Order signature, nonce and expiry they verified) and pay the maker in the same transaction, cheapest first alongside the pool leg. Permit2 is used only for taker USDC pulls. Both routers share one EIP-712 domain (verifying contract `TradeRouter`) and one nonce space, so `cancelAll` cancels asks and agent quotes together. Orders expire after 24 hours by default; `cancelAll` bumps the maker's nonce. Routers check the maker's balance first, and an order whose tokens were moved or recalled simply cannot fill. The per human cap is enforced by `NightToken` on the fill, and `makerRebate` is paid on fills. One quote surface message can price many nights. Trust: the operator sees the order book first; operator fills are on chain, so analytics can flag the operator filling asks before anyone else. Later option if transparency is needed: an `AskBook` contract outside the pool with escrowed asks, recallable by `NightToken`. Never v4 range orders: they break the `NightVault` only liquidity rule, the payout rule and recall. Verified on Arc testnet (chain 5042002, block 71096686): USDC is `0x3600000000000000000000000000000000000000` (6 decimals) and Permit2 is at its canonical address `0x000000000022D473030F116dDEE9F6B43aC78BA3`. Network: Arc mainnet 5042 with the official Uniswap v4 `PoolManager` `0x8366a39CC670B4001A1121B8F6A443A643e40951` (verified on chain, 24,009 bytes; PositionManager `0x6049c9a0e26405C0985f9E3685C87d0aE917f82B`, Universal Router `0x4fcA4a51Ab4F23A7447b3284fBd7D73289A89Fb1`, StateView `0xF3334192D15450CdD385c8B70e03f9A6bD9E673b`, Quoter `0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94`). Mainnet USDC is the same `0x3600000000000000000000000000000000000000` (eth_call: 6 decimals, symbol USDC) and Permit2 is canonical. Testnet 5042002 remains for dev runs on our own v4-core deployment. Mainnet safety limits are immutable in `NightFactory` and checked in `openNight`: `MAX_F` = 1 USDC (1e6 micro) floor price per room night, `MAX_POOL` = 50 USDC (cost(0, S) on the tick snapped ladder must be at most 50e6 micro, which bounds the top price, the reserve, the recall strike and every trade on that night), `MAX_S` = 100, and `MAX_OPEN_NIGHTS` = 20 (nights opened and not yet settled, decremented at cutoff settlement), so total exposure is at most 1,000 USDC. There is no per trade cap. The owner pause on the hook and on `NightToken` blocks entries and swap exits: swaps including sell-backs, ask fills, bookings, trader transfers and new opens. It never blocks burns, cutoff settlement, `pushBatch`, `claim` or walk payouts, so exits stay open while paused. `PoolManager`, USDC and Permit2 addresses live in deploy config and are never hard coded in contracts. Local end to end runs on an anvil fork of Arc mainnet (real `PoolManager` and Permit2) with a storage backed USDC mock etched at `0x3600...`, because anvil cannot execute Arc's native USDC system contract; one real testnet run checks native USDC coupling.
- Token order: pools are NightToken/USDC. The `NightToken` CREATE2 salt is mined so the token's address sorts below USDC, making it `currency0`, so the pool's native price is USDC per room night and no inverted math is needed.
- Settlement is 1:1 redemption into the pool. One token goes back into its pool and the holder receives the pool's bid for it, paid from that token's own reserve slice. The pool can always pay it, because that USDC is already in the host's positions. No oracle price and no outside funds are needed for the holder's principal.
- Tenth granularity. `NightToken` balances must be multiples of 0.1 room night (1e17 with 18 decimals, matching the API's tenths), enforced in `_update`. This bounds the largest holder list at 10·S. Routers swap the pool with exact output token amounts, because exact input USDC would produce non tenth amounts and revert. Burns, recall (1.0) and cutoff redemption are whole tenths already.
- Cutoff settles once, then pays in batches. One transaction freezes the pool, redeems held tokens into the pool, sends the 30% haircut to `RebatePool` and snapshots each holder's entitlement (`cutoffRefund`). Then a permissionless `pushBatch(night, n)` walks the snapshot with a cursor and transfers USDC to each holder. A failed transfer leaves a claimable balance, and `claim` is always available.
- At most 100 rooms per night (`MAX_S`). Opening at S = 100 costs about 2.7M gas for initialization plus ten `addLadderChunk` calls of 10 rooms at about 1.6M gas each; trading opens when the ladder is complete. `pushBatch` costs about 61k gas per holder, so callers use batches of about 100 holders. Ladder parity: room boundaries P(i) are floored to the v4 tick grid (1.0001^tick, tick spacing 1), and `model.js` (sha `53a8f129bd65`) snaps them the same way. At F 6,000, k 1.2, S 15 the model gives cost(6,7) = 10,091.428504 and cost(0,15) = 173,950.751355; pool fills are 4 to 45 micro USDC higher over 1 to 15 rooms. The parity tolerance is 1 micro USDC per fill, taker rounds up.
- Property ownership on chain comes from `bindProperty(property, hostPayout)` signed by the attester key, the same trust as `linkWallet`. `property` is `keccak256` of the UTF-8 property id, like the night id `keccak256("propertyId:roomTypeId:date")`. There is no first opener binding.

### Proposed shape (follows from the two decisions above)

**One pool per night.** A v4 pool trades exactly one currency pair, so each (property, room type, date) gets its own `NightToken` (ERC-20, 18 decimals, mint cap S) and its own pool against USDC. Pools on the v4 singleton cost only storage, so thousands of nights are fine. This replaces "one pool per room type for the whole calendar" in the pitch.

**The host curve as a liquidity ladder.** `NightVault` adds S single sided positions, one per room. Room i spans prices P(i) to P(i+1), where P(q) = F·e^(kq/S), with liquidity

```
L_i = 1 / (1/√P(i) − 1/√P(i+1))      (room nights, in token units)
```

Why it matches the model: with continuous liquidity L(P) = 2S·√P / k, a v4 range gives dx = S/(kP)·dP and dy = (S/k)·dP, so tokens sold q = (S/k)·ln(P/F) and USDC paid y = C(0, q). That is exactly the exponential curve. One position per room is exact at every room boundary and close inside it:

| Positions per night (F 6,000, k 1.2, S 15) | Worst room error | Full sell out |
| --- | --- | --- |
| 15 (one per room) | 0.036% | 173,951 vs 174,009 exact |
| 5 | 0.25% | 173,580 |
| 3 | 0.67% | 172,844 |

The 7th room costs 10,091 on chain against 10,095 exact. Tick spacing 1 (0.01%) keeps boundary rounding below that error. Sell back is an ordinary swap down the same ladder, so a round trip loses only fees, as in the model.

**Reserve and withdraw fall out of the pool.** USDC paid by buyers sits in the host's crossed positions, so the pool's USDC is the reserve R. Let b be the burned count (booked plus voided). Only h = q − b tokens exist outside the pool, so the price can never fall below P(b). The USDC in positions entirely below P(b) equals C(0, b) = R − L. `NightVault` sweeps those positions to the host automatically. b only grows: a guest booking moves q and b up by one, a trader buy moves q and h, a sell back moves both down, a recall moves b up and h down. Positions above the current price are never removed before cutoff.

**Fees in USDC, taken by the hook.** The pool's LP fee is 0. v4 LP fees are charged in the input currency, so a sell back would pay the host in night token dust. The hook takes its fee from whichever side of the swap is USDC: `beforeSwapReturnDelta` when USDC is the specified currency (exact input buy), `afterSwapReturnDelta` when USDC is unspecified (exact output buy, exact input sell). A buy pays `FEE` (1.0% host, 0.2% platform, 0.1% cover fund). A sell back pays `lateFee(hoursLeft)`.

**Who is trading.** The hook accepts swaps only from allowlisted routers (`BookingRouter`, `TradeRouter`) and reads the end user with the v4 periphery `IMsgSender(sender).msgSender()`. Aggregators cannot route into these pools; that is the price of World ID caps and guest recall. The per human cap lives in `NightToken._update`, so plain transfers cannot dodge it. `HumanRegistry` maps wallets to World ID nullifiers and is written by the verifier backend (trusted, as stated in the pitch).

**Hook callbacks**

| Callback | Rule |
| --- | --- |
| `beforeInitialize` | Only `NightFactory`. Checks LP fee 0, tick spacing 1, NightToken and USDC pair. Stores F, k, S, cutoff and host payout address |
| `beforeAddLiquidity` | Only `NightVault`, once, at open |
| `beforeRemoveLiquidity` | `NightVault`: positions entirely below P(b), paid to the host. `Settlement`: cutoff. Nothing else |
| `beforeSwap` | Revert when paused or at or after cutoff, or when the router is not allowlisted. Resolve the user. Traders need World ID Orb. Take the fee when USDC is specified |
| `afterSwap` | Take the fee when USDC is unspecified. Emit the trade for the indexer |
| `beforeDonate` | Always revert |

**Contracts**

| Contract | Job |
| --- | --- |
| `NightFactory` | Clones a `NightToken` per night, initializes its pool, has `NightVault` add the ladder |
| `NightToken` | ERC-20 per night. All S minted at open into the pool. Burn by `BookingRouter` and `Settlement`. Per human cap and tenth granularity (multiples of 1e17) in `_update`. `recall(amount)`, callable only by `BookingRouter`: moves tokens from the largest holders (an on chain ordered list of holders) and pays each X minus 1.3% in the same transaction |
| `NightHook` | The callbacks above. Owner only pause |
| `NightVault` | Owns the ladder positions, calls `PoolManager.unlock` directly (no position NFTs). No admin. Permissionless sweep of earned USDC to the host |
| `BookingRouter` | `buyAndRedeem(night, maxPrice)`: fills 1.0 from the pool and trader asks at or under X, recalls the rest at X, burns in the same transaction. Reverts if the night is sold out or above `maxPrice` |
| `TradeRouter` | Buys and sells for traders. Permissionless: fills any validly signed trader ask or agent quote (EIP-712, Permit2 pull, 24 h default expiry, nonce cancel) cheapest first alongside the pool leg, matching `routeBuy` |
| `Settlement` | Walked guest: accepts reports signed by the API attester key and pays `walkPayout` to the guest from the host's pending payouts, then `CoverFund`. Cutoff: freezes the pool, redeems every outstanding token into the pool at the bid minus `lateFee(0)` (30%, shared pro rata, `cutoffRefund`), sends the 30% haircut to `RebatePool`, snapshots each holder's entitlement (paid by permissionless `pushBatch`, with `claim` as fallback), then removes all host positions and returns the unsold rooms and remaining USDC to the host |
| `CoverFund` | Receives the cover share of every fee. Pays walked guests when the host's pending payouts fall short; that becomes host debt |
| `RebatePool` | One pool for all nights, since a night's haircut arrives after its trading ends. Funded by the late fee above 1.3% and cutoff haircuts. `TradeRouter` and `BookingRouter` pay the maker `makerRebate` (0.5% of the fill) when a trader ask fills at or below 1.05× the pool's current price, read from the pool in the same transaction. No P*, no off chain input. Rebates exist only on fills, because resting asks are off chain signed orders. The rate stays below 2×`FEE`, so filling your own ask always loses money |
| `HumanRegistry` | Wallet to `humanId`, the World ID Orb (`proofOfHuman`) uniqueness nullifier (uint256) of the fixed enrollment action `night-shares-enroll`, stable across re-login, device and IDKit reset (never the IDKit session id). World does not guarantee that Selfie and Orb credentials give the same nullifier, so only Orb verified users (who alone can trade, host or approve agents) are linked; Selfie only users, who only book stays, never appear in `HumanRegistry`. Written only by `linkWallet(humanId, wallet)` signed by the attester key (same trust as walk attestations). A wallet links to at most one `humanId`; relinking only via the attester. The 30% cap in `NightToken._update` sums holdings per `humanId` across all linked wallets, agent wallets included |

### Open decisions

1. Decided: ladder math in `market-model` (see Decided above).
2. Decided: guests recall from trader holdings at X, largest holder first (see Decided above). The guest tranche is removed.
3. Decided: the late fee above the base 1.3% and the 30% cutoff haircut go to `RebatePool`, never the host. The host controls guest routing (own site, desk, rooms outside the allotment), so it must not earn when trader held nights go unsold. The host earns only fees and sales.
4. Decided: signed orders off chain, open router, 24 h default expiry; `AskBook` contract as a later option (see Decided above).
5. Decided: the cutoff haircut is `lateFee(0)` = `LATE_MAX` (30%). Every unsold holder gets 70% of the average bid of the held reserve, `cutoffRefund` in `market-model` (for example q 6, h 4: L = 33,192, each room night gets 5,809, the pool keeps 9,958). The parked ask condition, `REFUND_AT_FAIR` and `unsoldRefund` are removed. The haircut goes to `RebatePool` (decision 3).
6. Decided: no double sale penalty. The walked guest rule replaces it.
7. Decided: NightToken/USDC, mined salt so NightToken is `currency0`. Arc USDC is `0x3600000000000000000000000000000000000000`, so about 21% of addresses sort below it and salt mining is cheap.

## Build order

Steps 1 to 5 are done for every service, on mocks.

1. Workspace skeleton, tooling, `packages/tsconfig`.
2. `packages/proto` with all services and working generation.
3. In parallel: `packages/market-model` (port and tests), `packages/design-system` (tokens from `mock/v2/assets/styles.css`), `apps/api` server skeleton with ports, mocks, interceptors and docs.
4. In parallel, one per domain: identity and wallet, catalog and stay, market, host.
5. End to end tests for every flow.
6. Replace mocks with real adapters, one port at a time.

## Walked guest

A guest who booked and was not let in taps the Night Shares reception tag and calls `ReportWalk` within `WALK_REPORT_HOURS` (24 hours) after check in time. The booking owner must report, a reception tap must exist for that booking, and no World ID desk check in may exist. Each booking can have only one report. `TapReception` and `ReportWalk` accept Device or Orb sessions. The mock adapter verifies a per property HMAC signature, accepts payloads for five minutes and rejects reuse. Real presence comes only from platform provisioned NFC tags. The platform provisions and keeps each tag's NTAG 424 keys; the hotel never receives them. The tag's monotonic counter gives single use. The mock stores its per tag counter in SQLite and increments it on each verified tap. `IssueReceptionTag` is disabled unless `DEV_TAG_ISSUER=true`, which defaults to false and requires `ADAPTERS=mock` at startup. This issuer is for local demos only and does not prove real presence. Check in is 15:00, matching the host guest arrival timeline and using the existing UTC calendar representation until catalog timezone metadata is available. A check in cannot be added while a walk report exists.

`walkPayout({paid, pending})` refunds `WALK_MULTIPLE` (1) times the complete booking price, including its fee, to the guest. Pending property payouts pay first, then `cover_fund`; only the fund advance becomes host debt. There is no holder redemption, reserve waterfall or separate penalty. The booking report port accepts authenticated reporter identity, booking ID and report time for a future attester or CRE adapter. The mock adapter retains stable IDs for polling. Direct RPC reports use the session identity and server clock. Each tap records `tagUid`, `counter` and `tapAt` in epoch milliseconds. Each walk report stores and exposes `evidenceHash`, the lowercase SHA256 hex digest of `${tagUid}|${counter}|${tapAt}|${bookingId}`. The typed `WalkAttestation` is the payload the API attester will sign. Walk reports reach Settlement only through that attester; Settlement stores and emits the evidence hash. Historical taps without counter evidence cannot support new reports.

Payout reservations and host debt change in one synchronous SQLite transaction before one atomic wallet settlement. Failure restores pending payouts and debt and removes the report reservation for retry. Automatic sweeps wait for pending reports, then net debt and repay the cover fund. Reports wait for pending sweeps. Wallet and chain interactions remain mock.

Each settled walk is a public property incident, listed by catalog stay detail and host hotel and portfolio responses. `WALK_SUSPEND_AFTER` (2) valid incidents suspend new openings with FAILED_PRECONDITION and “New openings are suspended after repeated walked guests.” False incidents remain public with a false annotation and do not count toward suspension.

`markWalkFalse` is a trusted administrator and test moderation stub, with no public RPC. It marks a settled report false and permanently bans every linked enrollment nullifier and alias of the reporter from `ReportWalk`, including future sessions and subsequently linked enrollments. It does not reverse settled money or ban other services yet. World exposes no documented link between Selfie and Orb enrollments under different accounts, so a banned Selfie only reporter can return with a new Orb enrollment; the residual risk is small because a walk report still requires a reception tag tap and no World ID desk check in. Production NFC verification and missing tag review remain future adapter and attester work.

Host opening pushes an inventory batch through the channel manager. Opened nights reject changes to F, k or S; `StopSelling` and manual host `Withdraw` are removed, with protobuf fields reserved. Failed confirmation restores inventory and release policy, records `channel_push_failed`, and returns UNAVAILABLE with “The hotel system did not confirm. Nothing changed.”
