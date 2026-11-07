import { expect, test } from "bun:test";
import {
  type Address,
  encodeAbiParameters,
  encodeEventTopics,
  type Hex,
  parseAbiItem,
} from "viem";
import { fixture } from "../../modules/market/testing/fixture";
import { executionFixture } from "../arc-deployment/fixture";
import type { ForkClient } from "../arc-deployment/validate";
import { createChainReader } from "./chain-reader.viem";

const transfer = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);
const outside = `0x${"ab".repeat(20)}` as Address;
const other = `0x${"cd".repeat(20)}` as Address;
const hash = `0x${"11".repeat(32)}` as Hex;

test("projects outside NightToken transfers and backfills newly discovered USDC wallets with resumable bounded cursors", async () => {
  const { ports } = await fixture();
  const db = ports.db;
  const d = executionFixture();
  d.block = 0;
  let interruptBackfill = false;
  const requests: {
    address?: Address | Address[];
    fromBlock: bigint;
    toBlock: bigint;
    args?: { from?: Address[]; to?: Address[] };
  }[] = [];
  const client = {
    getBlock: async ({ blockNumber = 20000n } = {}) => ({
      number: blockNumber,
      hash,
      timestamp: 100n,
    }),
    readContract: async () => false,
    multicall: async ({
      contracts,
    }: {
      contracts: { functionName: string }[];
    }) =>
      contracts[0]?.functionName === "config"
        ? [
            {
              cutoff: 1000n,
              F: 1000000n,
              k: 1000000000000000000n,
              S: 1000000000000000000n,
            },
            0n,
            0n,
            false,
            false,
            false,
            0n,
          ]
        : contracts.map(() => `0x${"00".repeat(32)}`),
    getLogs: async (request: (typeof requests)[number]) => {
      requests.push(request);
      expect(request.toBlock - request.fromBlock).toBeLessThanOrEqual(9998n);
      const addresses = Array.isArray(request.address)
        ? request.address
        : [request.address];
      const token = addresses.includes(d.NightToken);
      const usdc =
        addresses.includes(d.USDC) &&
        (request.args?.from?.includes(outside) ||
          request.args?.to?.includes(outside));
      if (usdc && interruptBackfill && request.fromBlock === 9999n) {
        throw new Error("Interrupted backfill");
      }
      if ((!token && !usdc) || request.fromBlock > 5n || request.toBlock < 5n)
        return [];
      return [
        {
          address: token ? d.NightToken : d.USDC,
          blockNumber: 5n,
          blockHash: hash,
          transactionHash: hash,
          logIndex: token ? 0 : 1,
          data: encodeAbiParameters([{ type: "uint256" }], [100n]),
          topics: encodeEventTopics({
            abi: [transfer],
            eventName: "Transfer",
            args: { from: outside, to: other },
          }),
        },
      ];
    },
  } as unknown as ForkClient;
  const reader = createChainReader(db, d, client, "test");
  reader.assertCurrent = async () => {};
  await reader.ready;
  db.query("INSERT INTO chain_nights VALUES (?, ?, ?, ?, ?)").run(
    "test",
    hash,
    d.NightToken,
    0,
    hash,
  );
  try {
    while ((await reader.poll()).number < 20000n) {}
    expect(db.query("SELECT address FROM chain_events").all()).toEqual([
      { address: d.NightToken },
    ]);
    for (const source of ["custody", "identity", "host"]) {
      db.query("DELETE FROM chain_usdc_wallet_cursors WHERE wallet = ?").run(
        outside,
      );
      db.query("DELETE FROM chain_events WHERE address = ?").run(d.USDC);
      if (source === "custody")
        db.query(
          "INSERT INTO wallet_custody VALUES ('late', 'mock', 'late', ?)",
        ).run(outside);
      if (source === "identity")
        db.query(
          "INSERT INTO identity_users VALUES ('late', 'late', 'orb', ?)",
        ).run(outside);
      if (source === "host")
        db.query(
          "INSERT INTO host_chain_bindings VALUES ('test', 'late', 'late', ?)",
        ).run(outside);
      if (source === "custody") {
        interruptBackfill = true;
        await expect(reader.poll()).rejects.toThrow("Interrupted backfill");
        expect(
          db
            .query(
              "SELECT number FROM chain_usdc_wallet_cursors WHERE wallet = ?",
            )
            .get(outside),
        ).toEqual({ number: 9998n });
        interruptBackfill = false;
      }
      await reader.poll();
      expect(
        db
          .query("SELECT address FROM chain_events WHERE address = ?")
          .all(d.USDC),
      ).toEqual([{ address: d.USDC }]);
      expect(
        db
          .query(
            "SELECT number FROM chain_usdc_wallet_cursors WHERE wallet = ?",
          )
          .get(outside),
      ).toEqual({ number: 20000n });
      const count = requests.length;
      await reader.poll();
      expect(requests.length).toBe(count);
      db.exec("DELETE FROM wallet_custody WHERE owner = 'late'");
      db.exec("DELETE FROM identity_users WHERE human_id = 'late'");
    }
  } finally {
    db.close();
  }
});
