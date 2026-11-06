# @night-shares/web

Next.js App Router foundation for Stay, Trade and Host. Route pages are placeholders for independent screen work. Import generated Connect Query descriptors for browser data access. The root layout loads design tokens.

Run `pnpm --filter @night-shares/web dev` from the workspace. The API must already be running at `http://localhost:8787`; override it with server-only `API_URL`. Build with `pnpm --filter @night-shares/web build`, then run `start`. Validation scripts are `typecheck` and `test`.

`Providers` supplies React Query, Connect transport and `SessionProvider`. Import `useSession` from `src/session/SessionProvider` and `useRequireAccess` from `src/session/require-access`. Server layouts use `requireAccessServer` from `src/session/require-access-server`. The Host group requires Orb. Protected screen actions must use the guard; the API enforces RPC access independently.

World ID starts through the mock port and generated Connect Query mutation. Completion uses a server action and sets `ns_session` with httpOnly, SameSite=Lax, a seven-day lifetime and Secure in production. No session token reaches browser JavaScript. The proxy rejects CompleteSignIn to prevent bypassing the action. Sign out revokes the token and clears the cookie. Session refresh clears cached account data.

Login accepts same-site `next`, `why` and `need` parameters. Device is used unless `need=orb`. Development shows a seed input; use `host` with Orb for seeded hotels. The mock scan remains available with default seeds in production builds until the real adapter replaces it. Trade night keys are URL-encoded `<propertyId>:<roomTypeId>:<date>` segments.

`formatUsdc` rounds bigint micros, defaults to two decimals and a USDC suffix, and accepts `{ decimals: 0 | 2 | 6, suffix: boolean }`. `formatRoomNights` formats integer tenths. `formatNight` validates ISO calendar dates and displays them in UTC to preserve the property date.

## Config-selected World ID

Set `WORLD_ID_MODE`, `WORLD_ID_APP_ID`, `WORLD_ID_ACTION` and optionally `WORLD_ID_VERIFY_URL` on the API, as described in [the API README](../api/README.md#world-id-cloud-verification). The web app only needs server-side `API_URL`; see `.env.example`. Mode and public widget parameters come from each start response. No `NEXT_PUBLIC_*` World ID variables or secrets are needed. Mock remains the default and retains the QR payload and Simulate scan controls.

Real login opens `IdKitPrompt` through `world-id-client.idkit.ts`. Check-in and agent approval use the same client through `useVerifyAction`, which starts a fresh authenticated request first. The widget receives `app_id`, `action`, `signal` and `verification_level`. Its `handleVerify` sends the structured proof to the server; `onSuccess` completes the UI flow only after server verification succeeds. Closing, timeout or rejection requires a fresh request. Login completion stays in the server action so the session token remains in its httpOnly cookie.

The exact dependency is `@worldcoin/idkit` 2.4.2 (published 2025-10-02). This is the deprecated v2 widget, intentionally paired with the frozen legacy proof contract. The [official cloud template](https://github.com/worldcoin/world-id-cloud-template/blob/main/src/app/page.tsx) demonstrates `IDKitWidget`, `handleVerify`, `onSuccess` and `verification_level`; this app additionally supplies the server-issued signal and never logs proofs. Today's [React reference](https://docs.world.org/world-id/idkit/react) documents the newer v4 signed-RP flow. This integration uses the still-documented [legacy cloud endpoint](https://docs.world.org/api-reference/developer-portal/verify-legacy), not v4. See the API README for upgrade implications and stable-subject rationale.

Run `bun test` and `pnpm typecheck`. Real World App scanning and browser modal behavior require manual/coordinator E2E verification with a configured Cloud action allowing unlimited verifications.

## Container runtime

Build from the workspace root with `docker compose build web`, then start the stack with `docker compose up -d`. The image installs with the frozen pnpm workspace lockfile, builds Next.js and starts it as a non-root user on port 3000. `API_URL=http://api:8787` directs server-side requests and browser RPC proxy requests to the API service. See `../../DEVELOPER.md` for volumes, readiness and shutdown configuration.
