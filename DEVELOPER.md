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
