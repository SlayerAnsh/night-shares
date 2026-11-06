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
- Real chain, real World ID, real channel manager. They come later, one adapter at a time.
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
| OpenNights | ORB | In: dates, room types, allotment percent, demand preset, release policy. Allotment never drops below booked plus held |
| StopSelling | ORB | Take back unsold rooms for the chosen nights |
| GetNight | ORB | Per room type state, activity, release timeline, payout split |
| GetPayout | ORB | Available now, held for traders, fees |
| Withdraw | ORB | Send available USDC to the host wallet |

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

Each property has one owner. The four seeded connected hotels (Velana, Ubud, Rive, Alpen) belong to the demo host, who signs in with the mock proof `mock:host:orb`. Other hosts start with no hotels and can claim only unowned properties (Salinas, Machiya) through `ConnectChannelManager`. Every host RPC checks ownership, and withdrawals are tracked per property.

### Market state

Night state (allotment, pool position `q`, booked, held, trader asks) lives in the market repository. On boot it is seeded from `nightState` in `market-model`, so numbers match the mock. After boot, buys, sells and bookings change it.

Hosts lock nothing beyond the traded nights themselves. There is no bond or security hold: the night's own escrowed reserve is the first collateral. A cover fund, fed by 0.1% of every trade's notional (carved out of the platform fee, so the 1.3% total fee is unchanged), backs offline double sales. Settlements pay that share to the `cover_fund` system address. `offlineSaleCover` in `market-model` defines the waterfall: the holder is made whole at the fair price from the voided night's reserve slice, then the host's pending payouts, then the cover fund; the host owes twice the fair price in total, and anything pending payouts cannot settle becomes host debt netted from future payouts. Track record limits how many rooms a new host can open.

Not in the first cut (listed so it is not forgotten): release at cutoff with unsold refunds, background order flow simulation, offline double sale cover and payout netting in the API (the model function exists; detection and settlement do not).

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

## Build order

Steps 1 to 5 are done for every service, on mocks.

1. Workspace skeleton, tooling, `packages/tsconfig`.
2. `packages/proto` with all services and working generation.
3. In parallel: `packages/market-model` (port and tests), `packages/design-system` (tokens from `mock/v2/assets/styles.css`), `apps/api` server skeleton with ports, mocks, interceptors and docs.
4. In parallel, one per domain: identity and wallet, catalog and stay, market, host.
5. End to end tests for every flow.
6. Replace mocks with real adapters, one port at a time.
