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
