# Night Shares platform spec

Night Shares turns hotel room nights into tradable units. Hosts offer nights, traders buy and sell them before the stay, guests book them through a normal checkout. Everyone signs in with World ID. Payments settle in USDC on Arc.

This document describes the backend and shared packages. The behaviour mirrors the approved static mock in `../mock/v2` (see its `README.md` and `assets/model.js`). When the mock changes its market model, `packages/market-model` is re-synced and this spec is updated.

Coding rules live in `STANDARDS.md`.

## Goals

- End to end flows work on mocks from day one: sign in, search, quote, book, check in, trade, open nights, payout.
- Every external system sits behind a port with a mock adapter, so each can be replaced by a real one without touching business logic.
- Protobuf is the single contract. Types, Connect clients, React Query hooks and OpenAPI docs are generated from it.

## Non-goals (for now)

- Visual design of the web app. The Next.js app is built logic first; styling follows the approved mock.
- Real chain, real World ID, real channel manager. They come later, one adapter at a time. The chain design is recorded below so the adapters have a target.
- A database. Repositories are in memory and seeded on boot.

## Layout

```
app/
  package.json            workspace scripts (pnpm)
  pnpm-workspace.yaml
  biome.json
  STANDARDS.md  SPECS.md  DEVELOPER.md  CHANGELOG.md
  apps/
    api/                  Bun + Connect server
    web/                  Next.js (later)
  packages/
    tsconfig/             shared tsconfig presets
    proto/                .proto sources, buf config, generated code and OpenAPI
    market-model/         pure pricing and book math (port of mock/v2/assets/model.js)
    design-system/        tokens and, later, React components shared by all web apps
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
| VerifyAction | DEVICE | Fresh World ID check for a sensitive action (check in, agent order over budget). Out: verification token |

`humanId` is the per app nullifier from World ID. Night Shares never receives a name or photo. Sign in creates or links a USDC wallet through `WalletProvider`.

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

| RPC | Access | Purpose |
| --- | --- | --- |
| Discover | PUBLIC | Night cards for the next 75 nights. Filters: city, sort (return, risk), value only, soon, watchlist |
| GetNight | PUBLIC | Night detail: fair price, stats, risk, price history, host track record, month calendar |
| GetBook | PUBLIC | Unified book: asks (pool slices and trader asks, guest only flagged), sell back bids with late fee, recall cap, fair price |
| ListTape | PUBLIC | Last 40 prints |
| QuoteBuy / QuoteSell | PUBLIC | Route preview: fills, average, fee, cap used, late fee, unsold refund |
| Buy | ORB | Execute a buy. Enforces per human cap and guest tranche |
| Sell | ORB | Sell back to the pool with late fee |
| PostAsk / CancelAsk | ORB | Park an ask. Warns past 2 times fair price or above recall cap |
| GetPortfolio | ORB | Holdings, listings, realised and unrealised P&L, track record |
| ToggleWatch / ListWatch | ORB | Watchlist |
| CreateAgentOrder / ApproveAgentOrder | ORB | Agent wallet orders. Orders over 1,000 USDC need a VerifyAction token |

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
    create-server.ts      node:http + connectNodeAdapter, CORS, /docs, /healthz
    routes.ts             registers every service handler
    interceptors/         auth (reads the access option), errors
    docs/                 serves OpenAPI files and a Swagger UI page
  container/              composition root: picks adapters, builds services
  shared/                 DomainError, money helpers, ids, dates
  ports/                  cross domain ports (one folder per port)
    clock/  ids/  identity-verifier/  wallet-provider/  onramp/  channel-manager/
      <port>.ts           interface
      <port>.mock.ts      mock adapter
  modules/<domain>/       identity, catalog, stay, market, host, wallet
    <domain>.handler.ts   proto <-> use case
    mappers/
    use-cases/            one file per use case, each with a test
    repo/                 repository interface and in memory implementation
  seed/                   the six mock properties and their room types
apps/api/test/e2e/        full flows through the generated Connect client
```

### Ports and their mocks

| Port | Mock behaviour | Real adapter later |
| --- | --- | --- |
| `Clock` | settable time | system clock |
| `IdGenerator` | counter based, prefixed | random ids |
| `IdentityVerifier` | any proof with `mock:` prefix verifies; returns a stable nullifier per seed | World ID cloud verify |
| `WalletProvider` | creates a fake address, keeps balances in memory, seeds 12,480 USDC | Arc USDC |
| `Onramp` | card charge always succeeds, converts 1:1 | card onramp |
| `ChannelManager` | returns room types and usual rates from seed, accepts reservation push and returns a hotel reference | Mews, Cloudbeds, SiteMinder |
| `SessionStore` | 256 bit random tokens, stored by SHA-256 hash | persistent store |
| `ActivityLog` | in memory list of night events (bookings, trades, asks, host changes) | database table or event stream |
| `VerificationStore` | one time World ID action tokens, five minute expiry, bound to user and action | persistent store |

The identity verifier returns a stable per app `subject` (used as `humanId`) and a per action `nullifier`. World ID gives a different nullifier for every action, so only the subject can link a later check to the signed in human.

### Money

Every payment goes through `WalletProvider.settle(legs)`, which applies all legs or none. Each money path (buy, sell, booking, withdraw) first reserves inventory and position in one synchronous `inventory.update`, then settles, and reverts both if settlement fails. A real Arc adapter maps `settle` to one multi transfer transaction.

### Host ownership

Each property has one owner. The four seeded connected hotels (Velana, Ubud, Rive, Alpen) belong to the demo host, who signs in with the mock proof `mock:host:orb`. Other hosts start with no hotels and can claim only unowned properties (Salinas, Machiya) through `ConnectChannelManager`. Every host RPC checks ownership, and automatic sweeps are tracked per property. Earned USDC (R minus L) is swept to the owner wallet after netting outstanding host debt. Sweep records and reservations prevent duplicate payments; failed settlement compensates both payout and debt reservations. Hosts cannot stop selling or manually withdraw after opening. F, k and S are fixed; unopened nights remain editable.

### Market state

Night state (allotment, pool position `q`, booked, held, trader asks) lives in the market repository. On boot it is seeded from `nightState` in `market-model`, so numbers match the mock. After boot, buys, sells and bookings change it.

Hosts lock nothing beyond the traded nights themselves. There is no bond or security hold: the night's own escrowed reserve is the first collateral. A cover fund, fed by 0.1% of every trade's notional (carved out of the platform fee, so the 1.3% total fee is unchanged), backs offline double sales. Settlements pay that share to the `cover_fund` system address. `offlineSaleCover` in `market-model` defines the waterfall: the holder is made whole from the voided night's reserve slice by redeeming into the pool at its bid (Chain design below), and the host owes a penalty of the same size from pending payouts, then the cover fund; the host owes twice that price in total, and anything pending payouts cannot settle becomes host debt netted from future payouts. Track record limits how many rooms a new host can open.

Not in the first cut (listed so it is not forgotten): release at cutoff with unsold refunds, background order flow simulation, offline double sale cover and payout netting in the API (the model function exists; detection and settlement do not).

### Agent wallets

Each Orb user has one mock agent ledger address, `agent:<userWallet>`, created lazily with zero balance. GetAgentWallet returns it. FundAgentWallet transfers the user's USDC to it with memo `agent_funding:agent`, wallet transaction kind AGENT_FUNDING (10), and activity `agent_wallet_funded`. WithdrawAgentWallet returns available funds to the user's wallet. Neither action resets spending. All transfers remain mock ledger settlements.

SetAgentBudget sets a lifetime total spend cap and a per-order cap in bigint micro USDC. Both start at zero. An optional exact night allowlist uses `propertyId:roomTypeId:date`; empty allows all nights. This is the minimal night filter corresponding to the mock's hotel, room and date rules. Raising the total authorizes additional spending. Lowering it below already reserved or spent USDC fails. Zero pauses new orders.

Every agent order pays from its agent address and checks actual quoted total, including fees, against its order budget, per-order cap and remaining total budget. Violations return FAILED_PRECONDITION. Inventory, the shared human position and budget spending are reserved synchronously in one SQLite transaction before wallet settlement. Settlement failure compensates all three synchronously. Concurrent requests share the human's order lock. Orders over 1,000 USDC stay pending until a user-bound VerifyAction token approves them. Approval rechecks current prices and budget. Successful fills append `agent_order_filled`.

Portfolio includes agent balance, budget, spent total and agent purchase attribution. Holdings remain in the human's shared position, preserving the combined per-night cap and existing sale and cutoff behavior. Agent attribution is capped at the remaining human holding for each night, using executed agent purchase quantities. It is not a separate custody position or a realized cost basis. Sales and cutoff refunds follow the shared human position; lifetime spending does not reset after a sale or withdrawal.

## apps/web

One Next.js (App Router) app. Stay, Host and Trade are separate product areas, each in its own route group with its own URL prefix and layout. They share one World ID session, like the mock. The first cut is logic only: real data flows on plain placeholder markup. Visual design follows the approved mock.

```
apps/web/
  app/
    layout.tsx                 root: tokens.css, Providers (React Query, Connect transport, session)
    page.tsx                   neutral entry with three doors (Stay, Host, Trade)
    login/page.tsx             World ID sign in; honours ?next=&why=&need= (why: trade, host, book, portfolio, watchlist, continue; need: orb or device)
    rpc/[...path]/route.ts     proxy to the API; adds Authorization from the session cookie
    (stay)/stay/...            Stay app: search, stay detail, checkout, trips
    (trade)/trade/...          Trade app: discover, night, portfolio
    (host)/host/...            Host app: portfolio, hotel, night, payout (whole area needs Orb)
  src/
    providers/                 query client, transport, session provider
    session/                   cookie, server actions (complete sign in, sign out), useSession, guards
    world-id/                  WorldIdClient port, mock adapter (QR plus Simulate scan), IDKit adapter later
    features/<app>/            hooks and small components per app, grouped by screen
    shared/                    formatting (USDC micros, tenths, dates), nav helpers
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
- No Chainlink CRE in this build; CRE is a later upgrade for the double sale report only. The report source sits behind a neutral port, so swapping the API attester for a CRE workflow does not touch the contracts' rules or the pricing. The four oracle jobs move off chain or into the pool:
  - Price: every on chain settlement uses the pool's own price, by redeeming the token into the pool. P* stays an off chain guide for the UI and agents, clamped by the host's usual rate from the channel manager. No ADR feed.
  - Double sale, booking honoured, occupancy: the API detects them through the `ChannelManager` port and World ID check ins. Only the double sale needs the chain; the API's attester key signs that report for `Settlement`. This is a trusted operator, the same trust as `HumanRegistry`, and is stated in the README.
- The host has no control over a night's tokens once it opens. All S tokens are minted into the pool at open as positions owned by `NightVault`, a contract with no admin. F, k and S cannot change after open. Earned USDC (below P(b)) is paid to the host's payout address automatically; anyone may trigger the sweep, but the money can only go to the host. There is no stop selling.
- The host trades like anyone else. To take rooms back it buys through the pool and burns them. On its own trades it pays the full 1.3% (its 1% host share goes to `RebatePool`), its holdings are shown on every night page, and the per human cap counts all its wallets as one human. It may sell back; analytics flags nights where the owner trades. Taking rooms back is cheap before traders hold any (only the fee) and costly after, because every buy lifts the price under all held tokens: for F 6,000, k 1.2, S 15, buying back 3 rooms costs 264 at q 0, 427 at q 6 with nothing held, 9,431 at q 6 with 4 held.
- Per human cap: 30% of S on every night (`CAP_HUMAN`, `capOf(S)`), not only peak nights.
- Guests come first through callable holdings, not a guest tranche. There is no guest only share. A guest's buy fills from the pool and trader asks at or under the recall strike X; anything left is taken from trader holdings at X (the holder gets X minus 1.3%), largest holder first. Only guests can recall. If nothing is left in the pool, in asks or in holdings, the night is sold out. A trader's upside on a night is therefore capped at X.
- Settlement is 1:1 redemption into the pool. One token goes back into its pool and the holder receives the pool's bid for it, paid from that token's own reserve slice. The pool can always pay it, because that USDC is already in the host's positions. No oracle price and no outside funds are needed for the holder's principal.

### Proposed shape (follows from the two decisions above)

**One pool per night.** A v4 pool trades exactly one currency pair, so each (property, room type, date) gets its own `NightToken` (ERC-20, 18 decimals, mint cap S) and its own pool against USDC. Pools on the v4 singleton cost only storage, so thousands of nights are fine. This replaces "one pool per room type for the whole calendar" in the pitch.

**The host curve as a liquidity ladder.** `NightVault` adds S single sided positions, one per room. Room i spans prices P(i) to P(i+1), where P(q) = F·e^(kq/S), with liquidity

```
L_i = 1 / (1/√P(i) − 1/√P(i+1))      (room nights, in token units)
```

Why it matches the model: with continuous liquidity L(P) = 2S·√P / k, a v4 range gives dx = S/(kP)·dP and dy = (S/k)·dP, so tokens sold q = (S/k)·ln(P/F) and USDC paid y = C(0, q). That is exactly the exponential curve. One position per room is exact at every room boundary and close inside it:

| Positions per night (F 6,000, k 1.2, S 15) | Worst room error | Full sell out |
| --- | --- | --- |
| 15 (one per room) | 0.027% | 173,962 vs 174,009 exact |
| 5 | 0.24% | 173,592 |
| 3 | 0.66% | 172,854 |

The 7th room costs 10,092 on chain against 10,095 exact. Tick spacing 1 (0.01%) keeps boundary rounding below that error. Sell back is an ordinary swap down the same ladder, so a round trip loses only fees, as in the model.

**Reserve and withdraw fall out of the pool.** USDC paid by buyers sits in the host's crossed positions, so the pool's USDC is the reserve R. Let b be the burned count (booked plus voided). Only h = q − b tokens exist outside the pool, so the price can never fall below P(b). The USDC in positions entirely below P(b) equals C(0, b) = R − L. `NightVault` sweeps those positions to the host automatically. b only grows: a guest booking moves q and b up by one, a trader buy moves q and h, a sell back moves both down, a recall moves b up and h down. Positions above the current price are never removed before cutoff.

**Fees in USDC, taken by the hook.** The pool's LP fee is 0. v4 LP fees are charged in the input currency, so a sell back would pay the host in night token dust. The hook takes its fee from whichever side of the swap is USDC: `beforeSwapReturnDelta` when USDC is the specified currency (exact input buy), `afterSwapReturnDelta` when USDC is unspecified (exact output buy, exact input sell). A buy pays `FEE` (1.0% host, 0.2% platform, 0.1% cover fund). A sell back pays `lateFee(hoursLeft)`.

**Who is trading.** The hook accepts swaps only from allowlisted routers (`BookingRouter`, `TradeRouter`) and reads the end user with the v4 periphery `IMsgSender(sender).msgSender()`. Aggregators cannot route into these pools; that is the price of World ID caps and guest recall. The per human cap lives in `NightToken._update`, so plain transfers cannot dodge it. `HumanRegistry` maps wallets to World ID nullifiers and is written by the verifier backend (trusted, as stated in the pitch).

**Hook callbacks**

| Callback | Rule |
| --- | --- |
| `beforeInitialize` | Only `NightFactory`. Checks LP fee 0, tick spacing 1, NightToken and USDC pair. Stores F, k, S, cutoff and host payout address |
| `beforeAddLiquidity` | Only `NightVault`, once, at open |
| `beforeRemoveLiquidity` | `NightVault`: positions entirely below P(b), paid to the host. `Settlement`: double sale and cutoff. Nothing else |
| `beforeSwap` | Revert when paused or at or after cutoff, or when the router is not allowlisted. Resolve the user. Traders need World ID Orb. Take the fee when USDC is specified |
| `afterSwap` | Take the fee when USDC is unspecified. Emit the trade for the indexer |
| `beforeDonate` | Always revert |

**Contracts**

| Contract | Job |
| --- | --- |
| `NightFactory` | Clones a `NightToken` per night, initializes its pool, has `NightVault` add the ladder |
| `NightToken` | ERC-20 per night. All S minted at open into the pool. Burn by `BookingRouter` and `Settlement`. Per human cap in `_update`. `recall(amount)`, callable only by `BookingRouter`: moves tokens from the largest holders (an on chain ordered list of holders) and pays each X minus 1.3% in the same transaction |
| `NightHook` | The callbacks above. Owner only pause |
| `NightVault` | Owns the ladder positions, calls `PoolManager.unlock` directly (no position NFTs). No admin. Permissionless sweep of earned USDC to the host |
| `BookingRouter` | `buyAndRedeem(night, maxPrice)`: fills 1.0 from the pool and trader asks at or under X, recalls the rest at X, burns in the same transaction. Reverts if the night is sold out or above `maxPrice` |
| `TradeRouter` | Buys and sells for traders. Fills signed trader asks and agent quotes cheapest first alongside the pool leg, matching `routeBuy` |
| `Settlement` | Accepts reports signed by the API attester key. Double sale: redeems each affected token into the pool with no fee (the holder gets the pool bid), then pays a penalty of the same size from the host's pending payouts, then `CoverFund`, as host debt netted from future payouts. Cutoff: freezes the pool, redeems every outstanding token into the pool at the bid minus `lateFee(0)` (30%, shared pro rata, `cutoffRefund`), sends the 30% haircut to `RebatePool`, then removes all host positions and returns the unsold rooms and remaining USDC to the host |
| `CoverFund` | Receives the cover share of every fee. Backs only the double sale penalty, never the holder's principal |
| `RebatePool` | One pool for all nights, since a night's haircut arrives after its trading ends. Funded by the late fee above 1.3% and cutoff haircuts. `TradeRouter` and `BookingRouter` pay the maker `makerRebate` (0.5% of the fill) when a trader ask fills at or below 1.05× the pool's current price, read from the pool in the same transaction. No P*, no off chain input. Rebates exist only on fills, because resting asks are off chain signed orders. The rate stays below 2×`FEE`, so filling your own ask always loses money |
| `HumanRegistry` | Wallet to World ID nullifier |

### Open decisions

1. Quote parity: `market-model` prices on the exact exponential, the chain on the ladder (up to 0.03% apart per room). Recommended: switch `market-model` to ladder math so quotes match the chain to the micro.
2. Decided: guests recall from trader holdings at X, largest holder first (see Decided above). The guest tranche is removed.
3. Decided: the late fee above the base 1.3% and the 30% cutoff haircut go to `RebatePool`, never the host. The host controls guest routing (own site, desk, rooms outside the allotment), so it must not earn when trader held nights go unsold. The host earns only fees and sales.
4. Trader asks on chain: signed orders through `TradeRouter` (recommended first) or v4 range orders managed by the hook.
5. Decided: the cutoff haircut is `lateFee(0)` = `LATE_MAX` (30%). Every unsold holder gets 70% of the average bid of the held reserve, `cutoffRefund` in `market-model` (for example q 6, h 4: L = 33,192, each room night gets 5,809, the pool keeps 9,958). The parked ask condition, `REFUND_AT_FAIR` and `unsoldRefund` are removed. The haircut goes to `RebatePool` (decision 3).
6. Double sale penalty size: 1× the pool bid (the cover order in `offlineSaleCover`, called with the pool bid in place of P*) or larger.
7. Token order: `currency0` is the lower address. Either mine the `NightToken` CREATE2 salt to fix the order, or make the ladder math handle both.

## Build order

Steps 1 to 5 are done for every service, on mocks.

1. Workspace skeleton, tooling, `packages/tsconfig`.
2. `packages/proto` with all services and working generation.
3. In parallel: `packages/market-model` (port and tests), `packages/design-system` (tokens from `mock/v2/assets/styles.css`), `apps/api` server skeleton with ports, mocks, interceptors and docs.
4. In parallel, one per domain: identity and wallet, catalog and stay, market, host.
5. End to end tests for every flow.
6. Replace mocks with real adapters, one port at a time.

## Double sale cover

A neutral booking report port supplies offline double sale reports. Its mock adapter exposes `report(nightKey, rooms)` and retains stable report IDs for polling. A report closes the affected night and redeems every holder position, including listed tenths, at the current pool bid without a late fee. Reported rooms describe the incident; every outstanding position on that night is covered. Seeded mock market maker holdings receive the same redemption.

The cover waterfall uses the night's reserve slice, then the property's pending payouts, then `cover_fund`. The equal size host penalty uses remaining pending payouts. Unpaid cover and penalty become property debt. Future withdrawals net that debt and repay the cover fund, including partial repayment when no net payout remains. Reservation, positions and debt change in one synchronous SQLite transaction before one atomic mock wallet settlement. Failure restores the reservation for retry. Completed report IDs cannot pay twice. Wallet and chain interactions remain mock.

Host opening, editing and stopping push an inventory batch through the channel manager. Failed confirmation restores inventory and release policy, records `channel_push_failed`, and returns UNAVAILABLE with “The hotel system did not confirm. Nothing changed.”
