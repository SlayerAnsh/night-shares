# Chain market execution

When `ChainExecutor.mode` is `fork`, the market handler uses `chain/` for monetary operations. Custody and the validated startup deployment come from the existing wallet provider and the active `chain_instances` record. `configureChainMarket` supports explicit dependency injection. Mock paths below remain unchanged.

Quotes simulate the actual router from the custody sender after bounded approval provisioning. `MARKET_SLIPPAGE_BPS` defaults to 50 and accepts integer basis points from 0 to 10000. Buy and sell requests retain their explicit price limits. The `idempotency-key` request header, when supplied for buy/sell, is scoped to the deployment and human. Pending intent retries always reuse the saved command. Definitive failure releases a reservation; ambiguous delivery retains it. Agent `spent` changes only after a successful receipt.

Signed asks use their own deployment-scoped table. Cancel-one journals `cancelAll`, then re-signs the persisted keep-list with the new nonce and remaining quantities. Cancel-all covers the user's known maker wallets, including agent custody. A replacement revokes the old signature before signing the new listing. No synthetic token escrow or fee transfers occur.

`recoverChainMarket(deps)` is the Task 5 recovery entrypoint. Run it after chain journal recovery. It resumes pending trades, transfers and cancellation keep-lists, and completes receipt-backed agent order records. Approved checkpoints can also resume through checkpoint polling without reusing the OIDC proof. Trade preparation deadlines and approval payloads survive retries.

Portfolio reads use wallet balances and cached-human snapshots, including external transfers. Cost basis and realized P&L replay canonical contract events; an external acquisition with unknown cost does not receive a fabricated basis. Pool depth is not reconstructed from the continuous model: executable pool pricing is available through the quote endpoints. Cutoff claims execute separately from each entitled custody wallet.

The reviewed `task3-ports.patch` adds wallet credit and claim-holder fields to the protobuf sources outside this task's scope. Apply it and run `pnpm --filter @night-shares/proto gen` before exposing those fields over RPC. The use cases and handlers already produce the data; current generated encoders omit unrecognized fields.

Run `bun test src/modules/market src/modules/wallet` from `apps/api`. Run `FORK_IT=1 bun test src/modules/market/chain/fork.test.ts` against a local RPC with the current deployment artifact. The test forks that RPC into a disposable child and uses a separate custody derivation range; it never advances the shared fork clock.

# Mock cutoff settlement

The cutoff uses the stored `host_releases.release_policy`: arrival at 14:00, the previous day at 18:00, or three days before arrival at 12:00. An absent policy means arrival at 14:00. These match `mock/v2/assets/host.js` RELEASES. Absolute milliseconds use the existing host calendar's UTC representation of local dates. Catalog has no property timezone field; timezone-aware conversion must be introduced together with host calendars when that metadata exists. Relative seeded `hoursLeft` does not determine the cutoff. A released record retains its absolute `cutoffAt`.

The main process starts the job registry at `JOB_INTERVAL_MS` (default 60000). Server construction and tests do not start timers. `createJobRunner(...).tick()` runs a deterministic tick against the injected Clock. Concurrent ticks share one promise. Cutoff waits for pending market settlements and busy booking locks to finish, so their compensation cannot restore inventory after release. A failed job is reported and retried on a later tick.

For each materialized due night, one synchronous SQLite transaction marks the night released and stopped, reconciles previously filled asks, returns remaining ask escrow, closes positions, and records returned unsold inventory in `returnedTenths`. Existing curve parameters remain for historical payout accounting. Held inventory becomes zero and asks become empty. One atomic mock wallet settlement pays all holders, including the seeded market maker, from the pool. Failure synchronously restores inventory and positions. Successful settlement appends cancellation, refund and release activity. Released inventory cannot be reopened, traded or booked.

The refund per room night is `cutoffRefund(state).perNight`. Every holder receives that price multiplied by integer tenths divided by ten, regardless of ask price. USD is rounded to micros once per night before fractional multiplication. The model's optional `cutoffPaid` payout adjustment subtracts settled refunds from host proceeds and releases the remaining reserve. The 30% haircut remains in the pool. Existing protobuf `unsoldRefund` fields retain their wire names but now carry cutoff refunds.

Settlement follows the existing reserve, await, compensate pattern. It is not crash-atomic across inventory and the wallet adapter. This legacy path uses mock wallet settlement.

Run `bun test src/modules/market src/jobs` from `apps/api`. The coordinator runs `bun test test/e2e/cutoff.test.ts` where port binding is permitted.
