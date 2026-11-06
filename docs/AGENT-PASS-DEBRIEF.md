# World ID Agent Pass integration debrief (draft)

## Integration and demo journey

Night Shares pauses agent wallet purchases above 1,000 USDC. The signed-in Orb user reviews the saved order and selects “Approve with World ID”. A browser-bound checkpoint requests fresh Orb-class authentication. The backend redeems the code once, validates the signed result and checks the saved action and owner. It then commits the purchase, identity link and attempt consumption together. Denied, cancelled and expired attempts leave the order pending and the wallet unspent.

The adapter integrates the official OIDC endpoints discovered from World ID. Local mock authentication is a test mode, not evidence of a completed official flow. Wallet and chain settlement remain the existing SQLite mock ledger. No live World ID registration, sandbox authentication, production authentication or prize demo has been completed in this workspace session.

## Time to first success

Local mock completion and cryptographic token-fixture tests passed during this integration. Wall-clock time to first success was not instrumented. Time to first official success remains unmeasured because no registered client credentials or public HTTPS callback hostname were supplied. Replace this section with measured sandbox and production timings after the coordinator runs the demo.

## Friction

The browser's existing application session is held by the web app, while World ID returns to the API. This required a one-use API handoff and an HttpOnly callback cookie bound to the original live session. A raw callback state alone would not establish that browser binding.

The existing agent execution path awaited wallet settlement after reserving inventory. The checkpoint requirement needed a synchronous SQLite settlement path so order execution and one-use approval commit together. The ordinary agent path retains its existing asynchronous settlement and compensation behavior.

The browser research tool could not open the official pages. Direct HTTPS requests succeeded for the docs, registration guide, step-up guide, sandbox guide, token reference and discovery document. Dependency installation initially rejected the default pnpm store path; using the workspace's existing `node_modules/.pnpm-store` resolved it.

Full unit verification exposed an older persistence fixture assuming IDKit was the default approval mechanism, and an unrelated quote-price expectation mismatch. These were not World ID provider errors. The former needs explicit fallback configuration in `apps/api/src/modules/market/repo/market-repo.sqlite.test.ts`, outside the authorized edit scope. The quote expectation passed on the final run after concurrent workspace changes; this task did not edit it.

## Missing capabilities or docs

No provider documentation gap was demonstrated by a live flow, since credentials were unavailable. The official guides explain essential ACR, pairwise subjects, backend validation and freshness clearly. Application-owned approval, browser session handoff and atomic execution still require application-specific engineering.

The sandbox guide requires access from an integration contact and warns that test credential issuance can take about an hour. That is a documented setup dependency, not an observed outage. Local signed JWT fixtures cannot replace a real sandbox or production run.

## Top improvement

Provide a small confidential-client human-checkpoint reference app showing a separate web origin and API callback, initiating-session binding, exact operation snapshots, transactional single-use execution and denial/expiry tests. Include an automated conformance fixture pack for ACR, AMR, nonce, freshness, subject mismatch and replay.

## Portal configuration and coordinator runbook

Use the portal for the same environment as the issuer. Register an application with these fields:

| Field | Value |
| --- | --- |
| Application name | Night Shares Agent Pass |
| Callback URL | `https://<public-api-host>/agent-pass/callback`, substituting the actual deployed API hostname; this exact string must also be `AGENT_PASS_REDIRECT_URI` |
| Client authentication | `client_secret_basic` |
| Default accepted accounts | Orb |
| Client ID | Copy the portal-issued value into backend `AGENT_PASS_CLIENT_ID` |
| Client secret | Copy the one-time secret into backend secret storage as `AGENT_PASS_CLIENT_SECRET` |

A concrete HTTPS callback cannot be registered until the public API hostname is chosen. The local mock value is exactly `http://localhost:8787/agent-pass/callback`; it is not valid for OIDC mode. Set `WEB_ORIGIN` to the deployed HTTPS web origin, `AGENT_APPROVAL=agent-pass`, `AGENT_PASS_MODE=oidc`, and `AGENT_PASS_ACR=https://world.org/oidc/acr/orb`. Production issuer is `https://auth.world.org`; sandbox issuer is `https://sandbox.auth.world.org`. Use `CLOCK=system` for real OIDC freshness checks. Keep their registrations, credentials and SQLite databases separate. The endpoint requires no additional scopes beyond `openid`.

1. Run `bun test test/e2e/agent-pass.test.ts` from `apps/api` in an environment permitted to bind ports. Five tests cover approval and replay, denial, cancellation, expiry and linked-subject mismatch. The implementation session ran unit tests only.
2. For a local demo use the default mock configuration, fund the agent with 5,000 USDC and set total and per-order caps to 5,000. With `TODAY=2026-12-01`, create 0.5 room nights for `prop_velana:rt_velana_0:2026-12-20` with a 5,000 USDC budget. Confirm the order requires approval. Current dates or prices may require another liquid night above the threshold.
3. Select approval, then Approve on the local mock page. Confirm the returned status is approved, the backend attempt is used, the order is executed and agent spend increased once. Retry the callback and confirm no second spend.
4. Use fresh orders and select Deny or Cancel. For expiry, leave a checkpoint for ten minutes using the system clock. Confirm pending order status and unchanged spend. Unit and HTTP e2e fixtures advance the injected clock without sleeping.
5. Repeat approval and cancellation with the registered sandbox client and sandbox World ID app. Capture the verification request, human completion, backend-validated result and executed order. Do not capture secrets, authorization codes, cookies or full ID tokens.
6. Complete a production flow with a real World ID before claiming production verification. Record actual time, friction and failure outcomes here.

## Verification at handoff

- Checkpoint-related unit tests: 48 passed, 0 failed across 10 files, including a full signed OIDC exchange with injected HTTPS responses and no listener.
- Web unit tests: 49 passed, 0 failed across 16 files.
- Full API unit suite: 348 passed, 1 failed across 139 files. The remaining persistence fixture invokes the IDKit approval path without opting into `agentApproval: "idkit"`. The fixture is outside this task's edit scope; a narrow scope extension was requested.
- API and web TypeScript checks passed. Scoped Biome passed for 45 files. Repository-wide Biome reported 151 diagnostics, primarily generated contract artifacts outside this scope.
- Five HTTP e2e tests are written for the coordinator and were not run because this session cannot bind ports.
- `jose` 6.2.3 was added to `apps/api/package.json` and installed. `pnpm-lock.yaml` was not changed because it is outside the explicit edit scope. Refresh the lockfile before a frozen-lockfile install.

## Sources consulted

- [World ID overview](https://auth.world.org/docs)
- [Step-up and human checkpoints](https://auth.world.org/docs/guides/step-up)
- [Client registration](https://auth.world.org/docs/guides/app-registration)
- [Sandbox and testing](https://auth.world.org/docs/guides/testing)
- [Token claims and authentication methods](https://auth.world.org/docs/guides/id-token)
- [OIDC discovery](https://auth.world.org/.well-known/openid-configuration)

- [jose remote JWKS options](https://github.com/panva/jose/blob/main/docs/jwks/remote/interfaces/RemoteJWKSetOptions.md)
