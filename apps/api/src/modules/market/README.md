# Market cutoff settlement

The cutoff uses the stored `host_releases.release_policy`: arrival at 14:00, the previous day at 18:00, or three days before arrival at 12:00. An absent policy means arrival at 14:00. These match `mock/v2/assets/host.js` RELEASES. Absolute milliseconds use the existing host calendar's UTC representation of local dates. Catalog has no property timezone field; timezone-aware conversion must be introduced together with host calendars when that metadata exists. Relative seeded `hoursLeft` does not determine the cutoff. A released record retains its absolute `cutoffAt`.

The main process starts the job registry at `JOB_INTERVAL_MS` (default 60000). Server construction and tests do not start timers. `createJobRunner(...).tick()` runs a deterministic tick against the injected Clock. Concurrent ticks share one promise. Cutoff waits for pending market settlements and busy booking locks to finish, so their compensation cannot restore inventory after release. A failed job is reported and retried on a later tick.

For each materialized due night, one synchronous SQLite transaction marks the night released and stopped, reconciles previously filled asks, returns remaining ask escrow, closes positions, and records returned unsold inventory in `returnedTenths`. Existing curve parameters remain for historical payout accounting. Held inventory becomes zero and asks become empty. One atomic mock wallet settlement pays all holders, including the seeded market maker, from the pool. Failure synchronously restores inventory and positions. Successful settlement appends cancellation, refund and release activity. Released inventory cannot be reopened, traded or booked.

The refund per room night is `cutoffRefund(state).perNight`. Every holder receives that price multiplied by integer tenths divided by ten, regardless of ask price. USD is rounded to micros once per night before fractional multiplication. The model's optional `cutoffPaid` payout adjustment subtracts settled refunds from host proceeds and releases the remaining reserve. The 30% haircut remains in the pool. Existing protobuf `unsoldRefund` fields retain their wire names but now carry cutoff refunds.

Settlement follows the existing reserve, await, compensate pattern. It is not crash-atomic across inventory and the wallet adapter. All wallet and chain interactions remain mocked.

Run `bun test src/modules/market src/jobs` from `apps/api`. The coordinator runs `bun test test/e2e/cutoff.test.ts` where port binding is permitted.
