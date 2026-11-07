# Public-chain catch-up

The factory event is `NightOpened(bytes32,address,address)`, with `night`,
`token`, and `host` all indexed and empty data. The Solidity interface and
`deployments/5042002.json` agree with the decoder. The previous reader requested
all chain logs, retained shared USDC transfers, and advanced only 100 blocks per
poll (at most 200 per job). Thus the reported cursor had only scanned the first
200 deployment blocks, not the later chain head. A matching ABI cannot project
an opening until the cursor reaches its block. No event-name mismatch was found.

Each poll now requests up to 9,999 inclusive blocks. A job drains to its initial
head without sleeping between ranges. The first query includes only the eleven
application contract addresses. Factory creations add token addresses before
querying token events over the same range, including events emitted before the
factory's creation log. Non-Transfer token events have an event-topic filter.
USDC and token Transfers use separate indexed `from` and `to` queries, OR-ing
known wallets and application contracts in groups of 100. Custody, identity,
Anvil, host payout, owner, platform and projected token addresses participate.
Results are deduplicated by block hash/log index and sorted before reduction.
Neither USDC nor other shared infrastructure receives an unfiltered log query.

The regression in `modules/market/chain/projection.test.ts` measures 30,000
blocks in four ranges, with 2 ms latency on every mocked getLogs call. A local
run took approximately 0.029 seconds, or 1.02 million blocks/second. Other RPCs
are immediate mocks; this is not a public-RPC throughput promise. With R seconds
of total validation, log and snapshot work per full range, expect approximately
9,999/R blocks/second, rather than 100 blocks per scheduler interval. More
wallet chunks and opened-night snapshots increase R. The test prints its own
elapsed time and rate on each run.

`fixtures/night-opened.json` records the exact ABI-encoded log shape using the
reported demo night/token and deployment owner. It is a deterministic ABI
fixture, not a claimed historical receipt. Historical verification was blocked:
`rpc.testnet.arc.network` returned HTTP 403 and `rpc.testnet.arc.io` returned
`requested data not available` for the deployment range. The actual demo opening
block therefore remains unverified against those public endpoints.

From `apps/api`, run a read-only disposable projection:

```sh
ARC_NETWORK=testnet bun --no-env-file src/dev/chain-check.ts --catchup
```

This validates deployment, scans from its deployment block to the observed
head, and prints `blocksScanned`, `logsIngested`, `nightsProjected`, and
`elapsedSeconds` inside redacted JSON. It uses an in-memory migrated database,
does not load signing keys, and never invokes transaction-producing chain jobs.
The RPC must retain deployment history. Set `ARC_RPC_URLS` explicitly when using
an archive-capable provider. No environment file is needed.

Reader construction eagerly starts the global pause snapshot. Discover waits
for that initial attempt, and historical replay cannot overwrite a newer pause
snapshot. The onchain pause adapter also starts its global refresh immediately
and exposes `ready`; night refreshes resolve `NightFactory.tokenOf` and combine
token and hook pause flags. Unresolved tokens and RPC failures remain closed.
