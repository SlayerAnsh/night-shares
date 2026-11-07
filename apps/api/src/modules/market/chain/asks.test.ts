import { expect, test } from "bun:test";
import type { Hex } from "viem";
import { executionFixture } from "../../../ports/arc-deployment/fixture";
import type { ForkClient } from "../../../ports/arc-deployment/validate";
import { serialize } from "../../../ports/chain-executor/chain-executor";
import type { ChainReader } from "../../../ports/chain-reader/chain-reader";
import { fixture } from "../testing/fixture";
import { liveAsks } from "./asks";
import { configureChainMarket } from "./runtime";

test("large books close stale asks and return the cheapest 50 with bounded multicalls", async () => {
  const deps = await fixture();
  const d = executionFixture();
  let calls = 0;
  deps.ports.chainReader = {
    fingerprint: "asks",
    head: async () => ({ number: 10n, timestamp: 100n }),
    tokenOf: async () => d.NightToken,
  } as unknown as ChainReader;
  deps.ports.chainExecutor = { mode: "chain" } as never;
  configureChainMarket(deps.ports, {
    deployment: d,
    custody: {} as never,
    client: {
      multicall: async ({
        contracts,
        blockNumber,
      }: {
        contracts: unknown[];
        blockNumber: bigint;
      }) => {
        calls++;
        expect(blockNumber).toBe(10n);
        expect(contracts.length).toBeLessThanOrEqual(300);
        return contracts.map((_, i) =>
          i % 3 === 0 ? 1n : i % 3 === 1 ? 10n ** 18n : 10n ** 19n,
        );
      },
    } as unknown as ForkClient,
  });
  try {
    for (let i = 0; i < 1205; i++) {
      deps.ports.db
        .query(
          "INSERT INTO market_chain_asks VALUES (?, ?, ?, ?, ?, ?, ?, 'open')",
        )
        .run(
          "asks",
          deps.key,
          d.OWNER,
          "human",
          "wallet",
          `0x${i.toString(16).padStart(64, "0")}`,
          serialize({
            order: {
              night: `0x${"11".repeat(32)}` as Hex,
              maker: d.OWNER,
              price: BigInt(1205 - i),
              expiry: i < 200 ? 100n : 101n,
              nonce: i < 400 ? 0n : 1n,
              size: i < 600 ? 10n ** 18n : 2n * 10n ** 18n,
            },
            signature: "0x",
            qty: 0n,
          }),
        );
    }
    const asks = await liveAsks(deps, deps.key);
    expect(asks).toHaveLength(50);
    expect(asks[0]?.order.price).toBe(1n);
    expect(asks[49]?.order.price).toBe(50n);
    expect(calls).toBe(11);
    const counts = deps.ports.db
      .query(
        "SELECT status, count(*) AS n FROM market_chain_asks GROUP BY status ORDER BY status",
      )
      .all();
    expect(counts).toEqual([
      { status: "cancelled", n: 200n },
      { status: "expired", n: 200n },
      { status: "filled", n: 200n },
      { status: "open", n: 605n },
    ]);
  } finally {
    deps.ports.db.close();
  }
});
