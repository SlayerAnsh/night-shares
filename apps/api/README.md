# @night-shares/api

Bun runs a Node HTTP server with Connect services for identity, catalog, stay, market, host and wallet. Every RPC is registered and returns `Code.Unimplemented` (`not built yet`) after its declared authorization requirement passes. Domain implementations can replace their module contents without changing shared files.

## Run and verify

From the workspace root:

```sh
CI=true pnpm install --no-frozen-lockfile --store-dir node_modules/.pnpm-store
pnpm --filter @night-shares/api dev
pnpm --filter @night-shares/api typecheck
pnpm --filter @night-shares/api test
pnpm --filter @night-shares/api e2e
pnpm check
```

From this directory, `bun src/main.ts` starts the server. Copy `.env.example` for local configuration. Boot rejects invalid values with the config key in the error. `PORT` defaults to `8787` (zero requests an ephemeral port). `ADAPTERS=mock` is the only supported adapter mode. `DB_PATH` defaults to `./data/night-shares.db`, relative to the working directory, and its parent folder is created automatically. `CLOCK=system|mock` defaults to `system`; `IDS=random|sequential` defaults to `random`. Optional `TODAY=YYYY-MM-DD` overrides the system clock's UTC calendar date while `now()` remains real time. With `CLOCK=mock`, TODAY fixes time at UTC midnight. Tests use mock time, sequential IDs and `DB_PATH=:memory:`. Existing unit fixtures that omit these three options receive test defaults when `NODE_ENV=test`; normal boot uses validated explicit defaults from `loadConfig`.

## SQLite foundation

`src/db/open-database.ts` opens bun:sqlite with WAL, foreign keys, a 5000 ms busy timeout and `safeIntegers: true`. Memory databases use SQLite's memory journal. INTEGER reads return bigint; adapters convert timestamps and quantities back to numbers while preserving money as bigint micro USDC. No ORM or extra dependency is used. `ports.db` exposes the same database to module repositories. Close it after stopping the server or test harness.

`migrate(db)` applies numbered SQL files in numeric order inside one immediate transaction and tracks version and filename in `schema_migrations`. Reopening skips applied migrations. Duplicate numbers and renamed applied files fail boot. Migrations are immutable after application. Use `NNN-<module>-<table>.sql` with unique numbers: 001-099 shared, 100-199 identity, 200-299 stay, 300-399 market, 400-499 host. Add module migrations to `src/db/migrations`; do not reuse an applied number.

| Migration | Tables and fields |
| --- | --- |
| 001-shared-inventory.sql | `inventory`: night_key primary key, indexed property_id/room_type_id/date, JSON record. |
| 002-shared-activity.sql | `activity`: sequence primary key, unique id, at, night_key, property_id, kind, tenths, nullable INTEGER price_micros, actor, nullable user_id. |
| 003-shared-sessions.sql | `sessions`: token_hash primary key, JSON user, indexed expires_at. Tokens expire after seven days, matching the web cookie. |
| 004-shared-verifications.sql | `verifications`: token_hash primary key, user_id, action, indexed expires_at, consumed flag. Tokens expire after five minutes and consumption persists. |
| 005-shared-wallet.sql | `wallet_balances`: address primary key, INTEGER balance_micros. `wallet_transactions`: sequence primary key, unique id, at, from_address/to_address foreign keys, INTEGER amount_micros, memo. |

`transaction(db, callback)` runs synchronous callbacks through `db.transaction(callback).immediate()` (BEGIN IMMEDIATE, with savepoints for nesting). Inventory lazy seeding and read-modify-write updates hold this write lock. A thrown callback rolls back its writes. The mock wallet validates aggregate source debits and applies all settlement legs and ledger entries inside one transaction. The use-case order remains synchronous reserve, await settlement, synchronous compensation on failure. This does not make a whole multi-store use case crash-atomic.

The wallet remains a mock of Arc contract interaction. Wallet balances and history persist, with 12,480 USDC seeded only for new user wallets and existing system balances retained across restarts. Channel manager remains mock. Module repositories will migrate separately; shared persistence alone does not persist their trips or positions yet. Memory adapters remain available for unit tests. `src/db/persistence.test.ts` verifies file restart safety and transaction rollback.

`GET /healthz` returns JSON. `GET /docs` serves Swagger UI 5.32.1 from jsDelivr with a six-service selector. `GET /docs/openapi/<name>.yaml` serves the corresponding checked-in proto specification. Names are `identity`, `catalog`, `stay`, `market`, `host`, and `wallet`. Swagger assets require internet access. CORS allows `http://localhost:3000` and Connect preflight headers.

## Shared contracts

`buildContainer(config)` returns `{ ports, modules }`. `Ports` contains `clock`, `ids`, `identityVerifier`, `walletProvider`, `db`, `channelManager`, `sessions`, `catalog`, `inventory`, `activity`, and `verifications`. `verifications` issues a one time World ID action token (identity `VerifyAction`) that stay `CheckIn` and market `ApproveAgentOrder` consume; tokens expire after five minutes. Each `createXModule(ports)` returns `{ service, handler }`, retaining the specific generated descriptor type and a complete `ServiceImpl<typeof XService>`.

The server installs interceptors in `[errors, auth]` order. Auth reads `getOption(request.method, access)` from `@bufbuild/protobuf` using `night_shares.auth.v1.access`. PUBLIC accepts anonymous calls, DEVICE requires a valid Bearer session, and ORB additionally requires `user.level === "orb"`. Missing sessions return Unauthenticated; insufficient or unconfigured access returns PermissionDenied. Valid sessions also populate public-call context. `optionalUser(ctx)` and `requireUser(ctx)` read the context. The outer error interceptor maps all six `DomainError` codes in one place and preserves existing Connect errors.

All port interfaces are in `src/ports`, except `CatalogRepo` and `InventoryRepo`, which live beside their shared implementations. External adapter methods are asynchronous. Catalog, inventory, activity and session operations are synchronous behind SQLite or memory adapters. Repositories return copies; inventory writes use `update(key, mutate)`. Missing catalog items return `undefined`; missing inventory property or room type raises `NOT_FOUND`.

| Port | Shared behavior |
| --- | --- |
| `WalletProvider` | `transactions(address)` returns bigint micro USDC transfers, newest first, with direction relative to the address. |
| `ActivityLog` | `append(event)` assigns an ID and clock timestamp. `list({ nightKey?, propertyId?, kinds?, limit? })` combines filters before limiting results, newest first. |
| `InventoryRepo` | `update(key, mutate)` seeds if needed, synchronously mutates and saves, and returns a clone. |

## Mock adapters

- Production IDs use a prefix and 128 random bits. Test IDs use deterministic per-prefix counters, such as `ids.next("bk")` yielding `bk_0001`.
- Identity accepts exactly `mock:<seed>:<orb|device>`. Nullifiers hash the seed and action scope. Use a consistent action such as `signin` for stable human IDs. Requests expire after five minutes and successful verification consumes the request. An Orb request cannot complete with a Device proof. Action verification can omit the request ID.
- Sessions hold `{ id, humanId, level, walletAddress }`; `create(user)` returns a token, `get(token)` returns a copy, and `delete(token)` revokes it. Both memory and SQLite sessions hash random tokens and enforce seven-day expiry.
- Wallet linking is stable per human ID and seeds 12,480 USDC only once. Transfers conserve bigint micro USDC and reject insufficient funds. The `SYSTEM_ADDRESSES` aliases `treasury`, `pool`, and `host` each start with 1 billion mock USDC. `linkWallet` can create additional host wallets. History uses transaction IDs and injected clock milliseconds. Equal timestamps place the latest entry first; self transfers appear once as outgoing. Initial balances are seeds, not transactions. Card payments and the onramp port have been removed.
- Channel manager supports Mews, Cloudbeds and SiteMinder, imports seeded room types with bigint usual rates, and accepts reservations with guest details for hotel forwarding. Reservation references are idempotent by booking ID and formatted like `VEL-000001`. Guest details are not retained in this adapter.

## Catalog and inventory

Six property snapshots and twelve room types come from `mock/v2/assets/shared.js`. Public IDs include `prop_velana` and `rt_velana_0`. The extra `modelId` preserves original mock hashing, such as `velana`; use it in market-model property inputs. Catalog metadata derives from generated protobuf shapes and adds the model's rate inputs.

`NightRecord` is `{ key, propertyId, roomTypeId, date, state: NightState, stopped, openedAt }`. `get(key)` and `seedNight(identity)` lazily seed and retain one record using `nightState({ property, roomIndex, date, today })`. `list(filter?)` returns only materialized records, optionally filtered by property, room type and an exclusive-end date range. Seed explicitly when enumerating a calendar. Advancing the clock does not regenerate existing records; domains should derive current timing from the clock when needed.

`state` deliberately preserves the market-model representation: USD numbers for model prices and room-night numbers for model quantities. All adapter, protobuf and ledger money boundaries use bigint micros. Mutator quantity arguments use integer tenths. Use `toMicros` and `toTenths` at model boundaries. `shared/money.ts` provides addition, multiplication by tenths (fractional micros truncate toward zero), USD conversion and protobuf conversion. Dates validate `YYYY-MM-DD`; ranges exclude checkout. Night keys validate and round-trip protobuf identities.

Writing to inventory: domains must use `inventory.update(key, record => ...)` for writes so no await sits between read and save. The callback runs synchronously on a clone of the latest record and must return the same night identity. A thrown callback leaves existing state unchanged. Inventory mutators return new records without saving or pricing. Domain use cases validate capacity, authorization, ownership, tranche and routing against the current record inside the callback before applying mutations.

Activity events carry a night key, property ID, kind, actor, integer tenths, optional bigint price per room night and optional user ID. Append returns a copy; list returns copies. Wallet history also returns copies.

| Mutator | State effect |
| --- | --- |
| `applyPoolBuy(record, tenths)` | Increases `q` and `held`. |
| `applyPoolSell(record, tenths)` | Decreases `q` and `held`. |
| `applyGuestBooking(record, tenths)` | Moves acquired or recalled holdings from `held` to `booked`; `q` stays unchanged. Apply pool fills first. |
| `applyTraderAskFill(record, askIndex, tenths)` | Reduces or removes a listing; aggregate ownership and `q` stay unchanged. Apply guest booking separately if needed. |
| `editAllotment(record, { tenths, preset, floor? })` | Changes supply and delegates curve parameters, tranche and cap to market-model; rejects supply below booked plus held. `floor` is a model USD number. |
| `openAllotment(record, edit, openedAt)` | Applies the edit, clears stopped and records injected clock time. |
| `stop(record)` | Sets stopped while preserving the curve and outstanding obligations. Domains must reject new sales while stopped. |

## Domain handoff and tests

Domain tasks own only `src/modules/<domain>/**` and `test/e2e/<domain>*.test.ts`. Each folder currently contains only `module.ts`. Shared ports, catalog-data, inventory, composition, server and harness are ready for those tasks and are not domain-owned. No protobuf changes are needed.

`createHarness()` in `test/e2e/harness.ts` starts an ephemeral server with fixed TODAY and exposes `container`, `server`, `baseUrl`, typed `clients`, `clientsFor(token)`, `signIn(level, seed?)` and `close()`. It optionally accepts a prebuilt container for infrastructure tests. Always close it in teardown. `signIn` calls the real StartSignIn/CompleteSignIn RPCs with mock proof syntax; it intentionally fails until identity is implemented.

Smoke tests call real HTTP/1.1 JSON Connect endpoints through `createConnectTransport`, cover all 43 registered stubs, verify access levels, check CORS and load all six documentation files. Separate infrastructure tests verify context propagation and every domain error mapping. Unit tests cover all inventory mutations, shared helpers and mock adapter flows. Smoke tests inject stub handlers into a fresh container so these infrastructure assertions keep passing as domain implementations land. Domain tests use the default harness with real module handlers.

## Host ownership and settlement

The host repository keeps one owner per property. The demo host signs in with `mock:host:orb`. On that user's first host RPC, the repository compares `humanId` with `mockSubjectFor("host")` and lazily assigns prop_velana, prop_ubud, prop_rive and prop_alpen. Those properties remain reserved before initialization. Other Orb users start with no hotels. prop_salinas and prop_machiya are initially unowned. ConnectChannelManager claims an unowned property only and rejects existing ownership with `PERMISSION_DENIED` and `This property is managed by another host.` Every property-scoped host read and write checks ownership; portfolios list owned hotels only. Withdrawals accumulate per property, and available payout subtracts that property's withdrawals.

WalletProvider.settle validates each source's aggregate debit across all legs before applying any balance or ledger changes. Insufficient funds raise `FAILED_PRECONDITION` with `Not enough USDC.` The mock performs validation and mutation synchronously without an await. A real Arc adapter maps the batch to one multi-transfer transaction. Transfer delegates to a single-leg settlement.

Market buys (including agent execution), sells and bookings synchronously route and reserve current inventory with position changes before awaiting one settlement containing every payment and fee. Failed settlement compensates inventory with inverse quantity and ask-fill mutations and reverses position changes. Booking compensation also releases the quote lock; trips and activity are published only after payment succeeds. Multi-night bookings reserve all dates without an intervening await. Locked-price subsidies pay recipients directly from treasury in the same batch, so validation never relies on incoming funds financing outgoing legs. Withdraw reserves the property's withdrawn amount before settling pool-to-host payment and reverses that reservation on failure.

Concurrency coverage lives beside the use cases and in `test/e2e/security.test.ts`. Run unit tests with `cd apps/api && bun test src`. E2E uses the harness's ephemeral server and must run in an environment that permits port binding.
