# @night-shares/web

Next.js App Router foundation for Stay, Trade and Host. Route pages are placeholders for independent screen work. Import generated Connect Query descriptors for browser data access. The root layout loads design tokens.

Run `pnpm --filter @night-shares/web dev` from the workspace. The API must already be running at `http://localhost:8787`; override it with server-only `API_URL`. Build with `pnpm --filter @night-shares/web build`, then run `start`. Validation scripts are `typecheck` and `test`.

`Providers` supplies React Query, Connect transport and `SessionProvider`. Import `useSession` from `src/session/SessionProvider` and `useRequireAccess` from `src/session/require-access`. Server layouts use `requireAccessServer` from `src/session/require-access-server`. The Host group requires Orb. Protected screen actions must use the guard; the API enforces RPC access independently.

World ID starts through the mock port and generated Connect Query mutation. Completion uses a server action and sets `ns_session` with httpOnly, SameSite=Lax, a seven-day lifetime and Secure in production. No session token reaches browser JavaScript. The proxy rejects CompleteSignIn to prevent bypassing the action. Sign out revokes the token and clears the cookie. Session refresh clears cached account data.

Login accepts same-site `next`, `why` and `need` parameters. Device is used unless `need=orb`. Development shows a seed input; use `host` with Orb for seeded hotels. The mock scan remains available with default seeds in production builds until the real adapter replaces it. Trade night keys are URL-encoded `<propertyId>:<roomTypeId>:<date>` segments.

`formatUsdc` rounds bigint micros, defaults to two decimals and a USDC suffix, and accepts `{ decimals: 0 | 2 | 6, suffix: boolean }`. `formatRoomNights` formats integer tenths. `formatNight` validates ISO calendar dates and displays them in UTC to preserve the property date.
