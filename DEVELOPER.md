# Developer guide

How to work on the Night Shares monorepo. What the system does is in `SPECS.md`. How code is written is in `STANDARDS.md`.

## Requirements

- Node 22 and pnpm 10 (workspace and scripts)
- Bun 1.2 (API server and tests)
- buf (only when you change `.proto` files; generated code is committed)

## First run

```sh
pnpm install
pnpm --filter @night-shares/api dev     # API on http://localhost:8787, reloads on save
```

Open http://localhost:8787/docs for Swagger UI with every service. `GET /healthz` returns 200 when the server is up.

## Everyday commands

Run from `app/`:

| Command | What it does |
| --- | --- |
| `pnpm gen` | Regenerate TypeScript, Connect Query helpers and OpenAPI from `packages/proto` |
| `pnpm check` | Biome format and lint |
| `pnpm typecheck` | `tsc --noEmit` in every package |
| `pnpm test` | Unit and end to end tests in every package |
| `pnpm --filter @night-shares/api e2e` | API end to end tests only |

Run all four of `gen`, `check`, `typecheck` and `test` before you commit.

## Environment and configuration

API settings come from `apps/api/src/config/load-config.ts` and `server-config.ts`. Use `apps/api/.env.example` and `apps/web/.env.example` as local templates. Defaults below are loader defaults; `JOB_INTERVAL_MS` is supported even though it is absent from the API example.

| Key | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8787` | API listener, integer 0 to 65535; 0 selects an ephemeral port |
| `DB_PATH` | `./data/night-shares.db` | SQLite path, or `:memory:` for isolated tests |
| `ADAPTERS` | `mock` | Only supported value; wallet and chain remain mock |
| `AGENT_APPROVAL` | `agent-pass` | Human approval policy: `agent-pass` or explicit `idkit` fallback |
| `AGENT_PASS_MODE` | `mock` | `mock` local Approve/Deny/Cancel page only with ADAPTERS=mock, or `oidc` official Agent Pass. Other adapters require OIDC credentials or AGENT_APPROVAL=idkit with WORLD_ID_MODE=cloud |
| `AGENT_PASS_ISSUER` | `https://auth.world.org` | Discovery issuer; sandbox uses `https://sandbox.auth.world.org`. Use separate databases for mock, sandbox and production |
| `AGENT_PASS_CLIENT_ID` | empty | Portal client ID, required for OIDC |
| `AGENT_PASS_CLIENT_SECRET` | empty | Backend secret, required for OIDC with `client_secret_basic`; never expose to web or logs |
| `AGENT_PASS_REDIRECT_URI` | `http://localhost:8787/agent-pass/callback` | Exact portal callback. OIDC requires `https://<public-api-host>/agent-pass/callback`, with the deployed API hostname substituted |
| `AGENT_PASS_ACR` | `https://world.org/oidc/acr/orb` | Exact required Orb class; weaker classes fail startup |
| `WEB_ORIGIN` | `http://localhost:3000` | Browser return origin. OIDC requires HTTPS. Returns to `/trade/portfolio?checkpoint=<status>` |
| `WALLET_CUSTODY` | `mock` | `mock` or `privy`; Privy enables server wallets and EIP-712 order signing |
| `PRIVY_APP_ID` | empty | Server wallet app ID, required in Privy mode |
| `PRIVY_APP_SECRET` | empty | Full-access backend secret, required in Privy mode; never log or expose to browsers |
| `PRIVY_AUTHORIZATION_KEY` | unset | Optional server-only `wallet-auth:` P-256 private key; new wallets assign its public key as owner |
| `CHAIN_LIMITS` | `mainnet` only when `ARC_NETWORK=mainnet` and `ADAPTERS=arc`, otherwise `off` | Explicit `mainnet` or `off`; mirror F <= 1 USDC, full ladder <= 50 USDC and 20 open nights. MAX_S=100 always applies |
| `CHAIN_PAUSED` | `false` | Mock chain status, `true` or `false`; rejects trading, all bookings and new opens while exits remain available |
| `AGENT_APPROVAL_THRESHOLD_USDC` | `10` with mainnet limits, otherwise `1000` | Explicit nonnegative USDC threshold, at most six decimal places |
| `ARC_NETWORK` | `mainnet` | `mainnet` (5042) or `testnet` (5042002) |
| `ARC_RPC_URL` | network RPC | Defaults to `https://rpc.mainnet.arc.io` or `https://rpc.testnet.arc.io` |
| `ORDER_CHAIN_ID` | network chain ID | Positive EIP-712 domain chain ID; explicit overrides win |
| `ORDER_VERIFYING_CONTRACT` | `0x0000000000000000000000000000000000000000` | EIP-712 verifying contract address |
| `ORDER_MOCK_SECRET` | `night-shares-dev-order-secret` | HMAC-SHA256 secret for mock order signatures |
| `DEV_TAG_ISSUER` | `false` | Set `DEV_TAG_ISSUER=true` for the local demo only. Enables guest tag issuance with `ADAPTERS=mock`; startup fails otherwise. Real presence requires platform provisioned NFC tags |
| `CLOCK` | `system` | `system` or settable `mock` clock |
| `TODAY` | unset | Optional valid `YYYY-MM-DD`; overrides the system clock's calendar date, not its timestamp, or initializes mock time |
| `IDS` | `random` | `random` or deterministic `sequential` IDs |
| `JOB_INTERVAL_MS` | `60000` | Positive scheduler interval in milliseconds, at most 2147483647 |
| `WORLD_ID_MODE` | `mock` | `mock` or `cloud`; `world-id` remains a compatibility alias |
| `WORLD_ID_APP_ID` | empty | Developer Portal app ID, required in cloud mode |
| `WORLD_ID_RP_ID` | empty | Registered `rp_...` ID, required in cloud mode |
| `WORLD_ID_SIGNING_KEY` | empty | Server-only 32-byte hex signing key, required in cloud mode |
| `WORLD_ID_ENROLL_ACTION` | `night-shares-enroll` | Fixed enrollment action. Changing it changes identity keys; do not rotate it casually |
| `WORLD_ID_ENVIRONMENT` | `staging` | `staging` for the Simulator or `production`; verified response must match |
| `WORLD_ID_ALLOW_LEGACY` | `true` | Temporary v3 Orb fallback for uniqueness actions; enrollment and session proofs always require v4 |
| `WORLD_ID_DEVICE_CREDENTIAL` | `selfieCheck` | `selfieCheck` or stricter `proofOfHuman`; ORB always requires `proofOfHuman` |
| `WORLD_ID_VERIFY_URL` | `https://developer.world.org/api/v4/verify/{rp_id}` | HTTPS endpoint receiving each complete IDKit result unchanged |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` or `silent` |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated exact HTTP(S) origins; no wildcard |
| `TRUST_PROXY` | `false` | Enable forwarded address handling only for trusted socket peers |
| `TRUSTED_PROXIES` | empty | Comma-separated IP addresses or CIDRs; empty trusts nobody |
| `TRUSTED_PROXY_HOPS` | `1` | Select this entry from the right of `X-Forwarded-For` |
| `RATE_LIMIT_ENABLED` | `true` | Enable per-process token buckets |
| `RATE_LIMIT_PER_IP` | `120` | General IP bucket capacity |
| `RATE_LIMIT_PER_USER` | `120` | Authenticated user bucket capacity |
| `RATE_LIMIT_IDENTITY` | `10` | Additional IP/user capacity for StartSignIn, CompleteSignIn and VerifyAction |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Token bucket refill window |
| `RATE_LIMIT_MAX_BUCKETS` | `10000` | Maximum tracked keys per limiter |
| `MAX_REQUEST_BODY_BYTES` | `65536` | HTTP request body limit |
| `CONNECT_READ_MAX_BYTES` | `65536` | Connect message read limit |
| `REQUEST_TIMEOUT_MS` | `30000` | Request deadline |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Request and job drain deadline before forced exit |
| `API_URL` (web) | `http://localhost:8787` | Server-only API upstream for direct calls and browser RPC proxying |

Server booleans accept only `true` or `false`. Server integer limits and timeouts must be positive integers at most 2147483647. Invalid config fails before listening. General IPv6 quotas group /64 prefixes; identity IP quotas group /48. Full bucket maps retain throttled entries and use a shared overflow bucket when no safe eviction is available.

For real identity verification, set `WORLD_ID_MODE=world-id` and a valid app ID. The web receives mode, app ID, action and signal from API requests and uses IDKit automatically; no public web environment keys are required. The fixed action preserves the human identifier, while a `purpose:nonce` signal and single-use SQLite request prevent replay. Sensitive flows start with `StartVerifyAction`.

`GET /healthz` reports liveness. `GET /readyz` checks SQLite access and all expected migrations. JSON logs cover requests and errors. SIGINT and SIGTERM stop new work, drain requests and jobs, then close SQLite; expiration of the shutdown deadline exits with code 1.

## Wallet custody and Arc

The PostAsk RPC prepares typed data and awaits custodial signing before opening its SQLite transaction. The transaction rechecks nonce and expiry and verifies the signature before inserting. Privy verification uses synchronous secp256k1 recovery and viem hashing/address conversion so no asynchronous work holds the transaction open. The existing mock signer remains unchanged. Legacy hand-built mock container fixtures without `arcNetwork` retain the historical testnet signing domain; normal boot uses `loadConfig`, which defaults to mainnet.

Create a Privy app and obtain its app ID and a full-access app secret from the dashboard. Server wallet API access must be available for that app. No Privy login UI or JWT authentication setup is required: World ID remains the only login. If using an authorization key, provision a P-256 key in the dashboard and set `PRIVY_AUTHORIZATION_KEY`; the adapter assigns its public key to newly created wallets. Changing this key does not transfer ownership of existing wallets. Any wallet policies must permit `eth_signTypedData_v4` for the NightShares domain and selected chain. These are custodial server wallets: the server controls signatures, not the user's World ID credential. See [Privy wallet creation](https://docs.privy.io/api-reference/wallets/create) and [authorization signatures](https://docs.privy.io/controls/authorization-keys/using-owners/sign/direct-implementation).

Migration `390-wallet-custody.sql` persists owner, provider, wallet ID and address. Stable external IDs prevent duplicate wallets beyond Privy's 24-hour idempotency window. Existing mock users retain addresses; they cannot produce Privy signatures for those addresses. New users receive custody addresses, while system wallets are provisioned lazily on ledger use. `GetBalance.system_wallets` always returns every system name in sorted order, with empty address and explorer URL until provisioned. Reads never create wallets. Provisioning can fill those fields later without changing list membership or order; ledger aliases remain unchanged. Ledger balances and settlement remain mock, including the initial 12,480 USDC seed. `onchain_usdc_balance` is separate ERC-20 micro USDC (6 decimals); it is absent on RPC failure, represented as null in the use case. Native gas USDC uses 18 decimals. `explorer_url` follows the selected network. No transfers or contract writes are sent. Arc RPC reads retry error `-32014` with bounded exponential backoff; future log readers must limit ranges to 9,999 blocks.

## Scheduled jobs

`apps/api/src/main.ts` starts the runner outside `NODE_ENV=test`. Each `JOB_INTERVAL_MS` tick runs `release-at-cutoff`, `double-sale`, then `host-sweep`. Cutoff releases cancel asks and settle refunds; report polling processes double sales; sweeps pay owners after debt netting. Concurrent ticks share the running promise. Job errors are collected while later jobs still run, and scheduled failures are logged.

Tests can construct `createJobRunner` with `createJobRegistry(ports)`, advance `ports.clock` as a `MockClock`, then `await runner.tick()` without starting timers. See `apps/api/test/e2e/cutoff.test.ts`. `runner.stop()` clears the interval and waits for active work.

## End to end tests

From `app/`, run:

```sh
pnpm --filter @night-shares/api e2e
```

For one flow:

```sh
cd apps/api
bun test test/e2e/cutoff.test.ts
```

The harness starts its own HTTP server on an ephemeral loopback port with in-memory SQLite, a mock clock, sequential IDs and mock adapters. No separately running API or external credentials are needed. The default harness disables rate limits and logs; ops tests override those settings. The host must permit listening sockets. Coverage includes identity, cutoff, recall, rebates, agent budgets, double-sale debt, hotel push compensation, host sweeps and operations.

## Calling the API by hand

Connect speaks plain JSON over HTTP POST:

```sh
curl -X POST http://localhost:8787/night_shares.catalog.v1.CatalogService/SearchStays \
  -H 'content-type: application/json' -d '{}'
```

RPCs marked DEVICE or ORB need `Authorization: Bearer <token>`. Get a token through `IdentityService.StartSignIn` and `CompleteSignIn`. The mock World ID accepts any proof of the form `mock:<seed>:<orb|device>`.

## Changing an API

1. Edit the `.proto` file in `packages/proto/proto/night_shares/<domain>/v1/`.
2. Set the `night_shares.auth.v1.access` option on every new RPC.
3. `pnpm gen`, then implement the handler and use case.
4. Add an end to end test in `apps/api/test/e2e/`.

## Adding a real adapter

Every external system is a port in `apps/api/src/ports/<name>/` with a mock next to it. To replace a mock:

1. Add `<name>.<impl>.ts` implementing the same interface.
2. Choose it in `apps/api/src/container/build-container.ts` based on config.
3. Keep the mock: tests and local development still use it.

## Market model

`packages/market-model` mirrors `../mock/v2/assets/model.js`. Parity tests load the mock file and compare results. When the mock changes, follow "Resynchronizing" in `packages/market-model/README.md` and update the pinned hash.

## Commits

One commit per task, Conventional Commits style (`feat(api): ...`). Stage explicit paths only.

## Running in containers

`docker-compose.yml` is the deployable stack: `api` and `web`. It targets Dokploy and also runs with plain Compose:

```sh
cp .env.example .env
docker compose up --build -d
docker compose logs -f
docker compose down
```

The API reads its runtime config and secrets from `.env` next to the compose file (gitignored, excluded from Docker build contexts). The file is optional; without it the API starts with mock defaults. `.env` accepts every key documented in `apps/api/.env.example`; the template lists the ones a deployment usually sets. The compose file fixes `PORT` and `DB_PATH`, which override `.env`. `apps/api/.env` remains the local `bun` development file and is not read by Compose.

No host ports are published (`expose` only), so the stack cannot collide with Dokploy's own port 3000 or other apps. For local access without a proxy, add a `ports` mapping in an untracked `docker-compose.override.yml`. API and web Dockerfiles use the workspace root as build context and install dependencies with pnpm 10.20.0 and the frozen lockfile. The API runtime is pinned to oven/bun:1.3.5 (released December 17, 2025). The web image runs `next build` during construction and `next start` as a non-root user at runtime.

The web service uses `API_URL=http://api:8787` for server-side calls and browser RPC proxying. Wallet and chain settlement remain mock. The API healthcheck calls `/readyz`; `/healthz` is process liveness. The API's named volume mounts at `/data`, with `DB_PATH=/data/night-shares.db`, and survives `docker compose down`. Removing the volume deletes persisted application data. Bind mounts used instead of the named volume must be writable by the image's bun user.

Keep `stop_grace_period` longer than `SHUTDOWN_TIMEOUT_MS` (defaults: 15 seconds and 10 seconds). On termination, the API drains requests and scheduler work before closing SQLite, or exits with code 1 if the deadline expires. Configure trusted forwarding only behind an ingress that sanitizes forwarded headers. The included web proxy shares one IP quota for its users.

The Arc fork chain (`docker-compose.chain.yml`) is a local development tool and is not part of the deployable stack. See Arc fork below.

### Dokploy

1. Create a Compose service pointing at this repository, compose path `app/docker-compose.yml` (or `docker-compose.yml` when the repository root is `app`).
2. Paste the contents of `.env.example`, with real values, into the Environment tab. Dokploy writes it to `.env` beside the compose file, which the API loads.
3. Add a domain routed to service `web`, container port 3000, with HTTPS. Only `web` needs a domain, because it proxies all API calls server-side. HTTPS matters because the production web build sets the session cookie `Secure`.
4. Set `WEB_ORIGIN` and `CORS_ORIGINS` to that domain's HTTPS origin and replace `ORDER_MOCK_SECRET`.
5. `AGENT_PASS_MODE=oidc` redirects the browser to the API callback, so it additionally needs a domain routed to service `api`, port 8787, and a matching `AGENT_PASS_REDIRECT_URI`. Mock Agent Pass needs neither.

Container execution and network e2e checks require a host with Docker and permission to bind ports. The operations unit suite runs without listening sockets: `cd apps/api && bun test src/server`.

## Arc fork

Start the local chain from the repository root, then start the API:

```sh
docker compose -f docker-compose.chain.yml up
# In another terminal, after deployment has produced 5042-fork.json:
cd apps/api
ARC_NETWORK=fork WALLET_CUSTODY=anvil bun run dev
```

The deployment file is generated per run and gitignored. Restart the API after redeployment. All fork addresses and contract ABIs come from this file. Mainnet loads `packages/contracts/deployments/5042.json` when present; without it the existing network constants remain available. Unset `ARC_NETWORK` retains mock development behavior.

| Variable | Fork behavior |
| --- | --- |
| `ARC_NETWORK` | `fork` selects chain 5042. |
| `ARC_RPC_URL` | Defaults to `http://127.0.0.1:8545`; use `http://chain:8545` inside Compose. |
| `ARC_DEPLOYMENT_FILE` | Defaults to `packages/contracts/deployments/5042-fork.json`, resolved from the repository root, regardless of working directory. Missing or invalid files fail startup. |
| `CHAIN_STATUS` | `onchain` by default on fork, otherwise `mock`. Reads `NightHook.paused()` and deployment `NightToken.paused()`. |
| `WALLET_CUSTODY` | `anvil` is fork-only; default remains `mock`. |
| `FORK_FAUCET` | Defaults to `false`. When `true`, first allocation requests 100 mock USDC using `mint(address,uint256)` from funded Anvil account 0 and waits for its receipt. |
| `FORK_ATTESTER_KEY` | Optional Anvil account 9 key, read only on fork, retained behind a config accessor and redacted in JSON dumps. Supply outside committed files. |
| `FORK_IT` | `1` enables the live read-only integration test. |

Anvil custody uses the public test mnemonic and persists user and system derivation indices starting at 100 in the adapter-owned SQLite `anvil_wallets` table. Keep the database to retain assignments. These accounts sign EIP-712 locally; they are not automatically linked in HumanRegistry. The faucet records allocation before sending a transaction, so failed or interrupted minting is not retried automatically. Existing allocations are not funded retroactively when the faucet is enabled. No trade execution is implemented here.

Pause snapshots expire after five seconds. Synchronous trading guards reject while the first or expired snapshot refreshes, and on RPC failure. Reads cover the deployment's demo NightToken, not dynamically discovered nights. Domain overrides must match deployment `EIP712Domain` exactly. Remove stale `ORDER_VERIFYING_CONTRACT` overrides when switching to fork.

Validate from `apps/api`:

```sh
npx tsc --noEmit
bun test
FORK_IT=1 bun test src/ports/arc-deployment/fork.integration.test.ts
```

### Fork execution foundation (Task 1)

`ARC_NETWORK=fork` selects the viem execution foundation independently of mock PMS/reception adapters. It requires Anvil custody and a local HTTP(S) RPC (`127.0.0.1`, `localhost`, `::1`, or Compose `chain`). Startup runs a bounded RPC preflight before the synchronous container returns: chain ID 5042, deployed code, reviewed function, event and custom-error ABI schemas including credits, immutable wiring, attesters, factory dependencies and EIP-712 domains must match the deployment artifact. The artifact is read once; no per-run address is embedded in the adapter. Optional metadata is retained by the loader. The fingerprint includes deployment addresses, deployment block/hash and ABI bundle.

The fork wallet provider reads ERC-20 cash on chain and rejects legacy `settle`, `transfer` and synthetic history calls. Tasks 2–5 must integrate the intent ports before those product flows work in fork mode. Unset `ARC_NETWORK` retains the existing mock ledger. No product decisions from plan section 6 are implemented.

Consumers use these contracts:

- `ports/chain-executor/chain-executor.ts`: `ChainCommand`, `ExecutionRequest`, `ExecutionResult`, `ChainExecutor.execute`, `recover`, and `pending`. Commands cover buy, sell, book, open, chunks, cancellation, sweep, cutoff, claims, credits, identity, binding, walk reports, transfers and approvals. Supply a stable operation ID and custody wallet ID. Amounts are bigint micro USDC, token quantities are bigint 18-decimal units, and deadlines are bigint seconds; `tokenTenths` and `soliditySeconds` convert API units explicitly.
- `ports/chain-executor/approvals.ts`: `ensureRouterAllowance` reads both allowance layers and journals bounded approval children. Pass the intended expiry and amount; wait for all children to finalize before the router command. Renewals need a new parent intent ID. Approval success does not imply trade success.
- `ports/chain-reader/chain-reader.ts`: `ChainReader.read`, `cash`, `tokenOf`, `simulate`, `ingest`, `watch`, `poll`, `head`, and `assertCurrent`. `snapshots.ts` adds typed position, night and allowance snapshots, including three separate credit balances. Reads carry block number/hash/timestamp. Resolve every token through the factory. Router simulation uses the real sender, asks, hints and bounds; it does not call the self-only pool quoter.
- `ports/chain-attester/chain-attester.ts`: `ChainAttester.sign(Attestation)` handles typed link/relink, bind and individual walk payloads. The optional attester signer uses only `FORK_ATTESTER_KEY`; `fork:attester` is the execution wallet for `verifyHuman`. No secret is persisted or logged. Custody account index 9 is never allocated as a user wallet.
- Container ports expose `chainExecutor`, `chainReader`, optional `chainAttester`, and `provisionWallet`. Existing hand-built mock fixtures may omit these fields. Mock command consumers must explicitly supply their existing ledger handler to `createMockChainExecutor`; existing use cases keep their current mock boundary.

The migration `530-chain-execution.sql` owns deployment instances, immutable commands, sender nonces, signed transactions, receipts, indexed logs, watch requests and snapshots. Keep the SQLite database and its WAL/SHM files private to the API service account: signed transactions are replayable until consumed. Execution must run outside SQLite transactions. Nonce allocation uses a short immediate SQLite transaction and a unique deployment/sender/nonce constraint across processes sharing that database. Sender nonce differs from maker order nonce. Signed bytes and their deterministic hash are committed before sending. Ambiguous delivery stays pending; recovery rebroadcasts identical bytes, and refuses a consumed nonce without its known receipt. It never retries the business action at a fresh nonce. Replacement transactions are not generated automatically.

Receipt ingestion and block polling use the same idempotent event reducer. Polling starts at the deployment block, discovers token creation logs before filtering the same block, and refreshes registered getter watches at that exact block. Integrators register known wallets, order fills, nights and property getters with `watch`; seeded demo metadata is available on the deployment. A cursor hash mismatch clears deployment projections and replays from deployment, marking receipt operations for reconciliation. A different fingerprint quarantines old pending work. Task 5 owns scheduling `poll` and `pending`/`recover`, plus workflow invalidation and accounting finalization. The executor's `finalized` state means canonical receipt ingestion, not completion of a caller's budget/PMS saga.

With `FORK_FAUCET=true`, wallet creation retries durable provisioning for existing allocations too. Native gas funding uses a guarded, idempotent local `anvil_setBalance` fixture operation; ERC-20 minting is a separately journaled command. Native USDC has 18 decimals, ERC-20 MockUSDC has 6. Execution estimates gas and current EIP-1559 fees and checks the native balance before each transaction; `FORK_GAS_HEADROOM_BPS` defaults to 12000 (120%). Explicitly provision the attester wallet before using it as a sender if necessary.

Run `cd apps/api && npx tsc --noEmit`, `bun test`, and `FORK_IT=1 bun test fork`. Fork tests require `anvil` on PATH and a reviewed deployment running at the local upstream RPC. They launch a disposable local child fork on an available ephemeral port, use a fresh SQLite journal, and never mutate the shared upstream. They cover wallet funding retry, separate gas/cash balances, both approvals, post-broadcast crash recovery across database reopen, idempotency and stale-operation rejection. Without `FORK_IT=1`, no integration transaction is broadcast.

## Local Arc fork API

Start the existing chain service from the repository root with
`docker compose -f docker-compose.chain.yml up -d`. Do not reset or redeploy a
shared fork. The deployment artifact must match that running instance and include
all reviewed credit and guest-link ABIs. Addresses are read at startup.

Run from the repository root (supply account 9's key through your local shell or
secret manager; do not commit it):

```sh
export ARC_NETWORK=fork
export CHAIN_STATUS=onchain
export WALLET_CUSTODY=anvil
export ARC_RPC_URL=http://127.0.0.1:8545
export ARC_DEPLOYMENT_FILE="$PWD/packages/contracts/deployments/5042-fork.json"
export FORK_FAUCET=true
export FORK_ATTESTER_KEY='<anvil 9 private key>'
export ADAPTERS=mock
export WORLD_ID_MODE=mock
export CLOCK=system
export IDS=random
export DB_PATH="$PWD/apps/api/data/fork.db"
export PORT=8787
export JOB_INTERVAL_MS=60000
export MARKET_SLIPPAGE_BPS=50
export DEV_TAG_ISSUER=true
pnpm --filter api dev:fork
```

`dev:fork` rejects non-local RPC URLs before importing the server. The deployment
preflight checks chain ID 5042, deployed code, dependencies, domains, and ABI
compatibility. Verify startup with `curl --fail http://127.0.0.1:8787/readyz`.
Native gas and the six-decimal mock USDC token are provisioned separately.
Keep this database separate from mock development. After a deployment reset,
restart against the new artifact and a new database; stale operation IDs must
never be replayed against another deployment.

Chain jobs poll canonical logs, recover pending execution and host/market/stay
intents, expire invalid signed asks using chain time, sweep permissionlessly,
and settle cutoff before pushing at most 100 holders per night per tick. Failed
pushes remain claimable by the holder. Token, hook, and settlement credits are
retried separately. NightVault credit retries require the outstanding
`task5-ports.patch`; its credit balance is watched in the meantime. Mock jobs
retain their existing ledger behavior. A failed deployment check stops chain
work; a successful simulation alone never finalizes a payout.

Run acceptance with `cd apps/api && FORK_IT=1 bun test test/fork`. It creates and
stops a disposable child Anvil fork, uses custody indices above 40001, and changes
only the child's clock and blacklist fixtures. The shared RPC must already be
running; the test never deploys or resets it.

Current integration follow-ups are recorded in the task brief directory:
`task5-ports.patch` adds NightVault withdrawal commands and skips token watches
before token creation during replay; `task5-stay.patch` accepts the same bare-hex
mock enrollment identifiers as the identity module; `task5-market.patch` treats
an empty RPC signature as a request for custody signing. These patches are not
applied to the owned port/module files. The acceptance fixture uses canonical
`0x` enrollment identifiers and explicitly signs asks through custody.

Acceptance covers a changed-fingerprint quarantine, not a full redeploy/reset
bootstrap. The independent Forge `ForkFlowTest.testLiveForkFullFlow` currently
reverts decoding `NightFactory.dependencies()`: the checked-out Solidity struct
has 13 addresses (including `settler`), while the running artifact returns 12.
Resolve that deployment/source mismatch before claiming full reference-flow
acceptance. Running `bun test` at the repository root also currently fails the
market-model fingerprint assertion (`53a8f129bd65` versus `5ed0433226df`); the API
suite and the fork acceptance suite are run from `apps/api`.

## Click a trade on the fork

Use the existing deployed fork and its matching deployment artifact. The seed
uses the API's mock Orb sign-in and host connection/opening use cases, funds
custody wallets 80001 and 80002, and opens three nights starting three days after
chain time. It never deploys or resets the chain. Repeating it reuses the same
wallets and nights. Explicit non-fork networks and non-local RPC URLs are refused.

From the repository root:

```sh
docker compose -f docker-compose.chain.yml up -d
cd apps/api && pnpm seed:fork
WORLD_ID_MODE=mock DB_PATH=./data/fork-clicktest.db FORK_FAUCET=true FORK_ATTESTER_KEY='<anvil 9 private key>' JOB_INTERVAL_MS=5000 pnpm dev:fork
```

In another terminal, from the repository root:

```sh
cd apps/web && pnpm dev
```

Open http://localhost:3000/trade. Sign in with Orb and the printed mock seed
`fork-click-trader`. If another account is signed in, use Switch account first.
Open one of the printed night keys, buy 0.1 room-night, and wait for Confirmed
with the transaction hash. Portfolio shows the purchased holding. The seed and
API must use the same `DB_PATH`; the seed defaults to `./data/fork-clicktest.db`
when run from `apps/api`. The seed uses the local public Anvil account 9 fixture
key unless `FORK_ATTESTER_KEY` is supplied. Never use these wallets outside a
local fork.

From the repository root, `pnpm --filter api seed:fork` is the equivalent seed
command. Verify the HTTP flow on disposable child forks:

```sh
cd apps/api
pnpm typecheck
bun test
FORK_IT=1 bun test test/fork
```

The HTTP test signs in through StartSignIn/CompleteSignIn, discovers only
factory-opened nights, quotes and buys with an idempotency key, checks the mined
Trade event and verifies the portfolio against its quantity. Test servers use
random ports; the existing API on :8787 and fork on :8545 remain running.
