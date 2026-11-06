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
| `AGENT_PASS_MODE` | `mock` | `mock` local Approve/Deny/Cancel page, or `oidc` official Agent Pass |
| `AGENT_PASS_ISSUER` | `https://auth.world.org` | Discovery issuer; sandbox uses `https://sandbox.auth.world.org`. Use separate databases for mock, sandbox and production |
| `AGENT_PASS_CLIENT_ID` | empty | Portal client ID, required for OIDC |
| `AGENT_PASS_CLIENT_SECRET` | empty | Backend secret, required for OIDC with `client_secret_basic`; never expose to web or logs |
| `AGENT_PASS_REDIRECT_URI` | `http://localhost:8787/agent-pass/callback` | Exact portal callback. OIDC requires `https://<public-api-host>/agent-pass/callback`, with the deployed API hostname substituted |
| `AGENT_PASS_ACR` | `https://world.org/oidc/acr/orb` | Exact required Orb class; weaker classes fail startup |
| `WEB_ORIGIN` | `http://localhost:3000` | Browser return origin. OIDC requires HTTPS. Returns to `/trade/portfolio?checkpoint=<status>` |
| `ORDER_CHAIN_ID` | `5042002` | Positive EIP-712 domain chain ID |
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

From the workspace root, build and start both services with:

```sh
docker compose up --build -d
docker compose logs -f api web
docker compose down
```

Stop local development servers on ports 8787 and 3000 before starting this stack, or change the compose host port mappings. API and web Dockerfiles use the workspace root as build context and install dependencies with pnpm 10.20.0 and the frozen lockfile. The API runtime is pinned to oven/bun:1.3.5 (released December 17, 2025). The web image runs `next build` during construction and `next start` as a non-root user at runtime. Both images exclude local environment files, database files, node_modules and build caches through `.dockerignore`.

The web service uses `API_URL=http://api:8787` for server-side calls and browser RPC proxying. Open `http://localhost:3000`; API documentation is at `http://localhost:8787/docs`. Wallet and chain settlement remain mock. The API healthcheck calls `/readyz`; `/healthz` is process liveness. The API's named volume mounts at `/data`, with `DB_PATH=/data/night-shares.db`, and survives `docker compose down`. Removing the volume deletes persisted application data. Bind mounts used instead of the named volume must be writable by the image's bun user.

Operational defaults and all configuration keys are documented in `apps/api/README.md` and `apps/api/.env.example`. Compose environment values do not automatically load that example file. Set overrides explicitly under the API service's environment configuration. Keep `stop_grace_period` longer than `SHUTDOWN_TIMEOUT_MS` (defaults: 15 seconds and 10 seconds). On termination, the API drains requests and scheduler work before closing SQLite, or exits with code 1 if the deadline expires. Configure trusted forwarding only behind an ingress that sanitizes forwarded headers. The included web proxy shares one IP quota for its users.

Container execution and network e2e checks require a host with Docker and permission to bind ports. The operations unit suite runs without listening sockets: `cd apps/api && bun test src/server`.
