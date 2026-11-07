import { expect, test } from "bun:test";
import { DiscoverSort } from "@night-shares/proto/market/v1/analytics_pb";
import {
  type Abi,
  encodeEventTopics,
  type Hex,
  type TransactionReceipt,
  zeroAddress,
} from "viem";
import { executionFixture } from "../../../ports/arc-deployment/fixture";
import type { ForkClient } from "../../../ports/arc-deployment/validate";
import { serialize } from "../../../ports/chain-executor/chain-executor";
import { createChainReader } from "../../../ports/chain-reader/chain-reader.viem";
import { fixture } from "../testing/fixture";
import { chainBook } from "./book";
import { chainPool, multicallAddress } from "./pool";
import { chainDiscover, chainNight } from "./queries";
import { configureChainMarket, nightHash } from "./runtime";

async function setup() {
  const deps = await fixture();
  const d = executionFixture();
  d.NightToken = zeroAddress;
  const block = {
    number: 2n,
    hash: `0x${"12".repeat(32)}` as Hex,
    timestamp: BigInt(Date.parse("2026-12-01T00:00:00Z") / 1000),
  };
  const token = "0x1111111111111111111111111111111111111111" as const;
  const config = {
    F: 1000000n,
    k: 10n ** 18n,
    S: 2n * 10n ** 18n,
    cutoff: block.timestamp + 86400n,
    host: d.OWNER,
  };
  let calls = 0;
  const client = {
    getBlock: async () => {
      calls++;
      return block;
    },
    readContract: async ({ functionName }: { functionName: string }) => {
      calls++;
      return functionName === "paused" ? false : token;
    },
    multicall: async (request: {
      multicallAddress: string;
      blockNumber: bigint;
      contracts: { functionName: string }[];
    }) => {
      calls++;
      expect(request.multicallAddress).toBe(multicallAddress);
      expect(request.blockNumber).toBeLessThanOrEqual(block.number);
      return request.contracts[0]?.functionName === "config"
        ? [config, 0n, 0n, true, false, false, 0n]
        : request.contracts.map(() => `0x${"0".repeat(64)}`);
    },
  } as unknown as ForkClient;
  const reader = createChainReader(deps.ports.db, d, client, "projection-test");
  await reader.ready;
  calls = 0;
  deps.ports.chainReader = reader;
  deps.ports.chainExecutor = { mode: "chain" } as NonNullable<
    typeof deps.ports.chainExecutor
  >;
  configureChainMarket(deps.ports, {
    client,
    deployment: d,
    custody: {} as never,
  });
  return {
    ...deps,
    d,
    block,
    token,
    reader,
    client,
    calls: () => calls,
    reset: () => {
      calls = 0;
    },
  };
}

test("specific night miss costs four RPC calls; warm Discover and GetNight cost zero", async () => {
  const s = await setup();
  try {
    await chainNight(s, s.key);
    expect(s.calls()).toBe(4);
    s.reset();
    const discover = await chainDiscover(s, {
      city: "all",
      sort: DiscoverSort.RISK,
      soon: false,
      valueOnly: false,
      watchlist: false,
    });
    expect(discover.nights).toHaveLength(1);
    await chainNight(s, s.key);
    await chainBook(s, s.key);
    expect(s.calls()).toBe(0);
    const row = s.ports.db
      .query<{ key: string }, []>("SELECT key FROM chain_night_keys LIMIT 1")
      .get();
    expect(row).toBeTruthy();
  } finally {
    s.ports.db.close();
  }
});

test("factory NightOpened logs project night/token/block idempotently without a demo token", async () => {
  const s = await setup();
  try {
    const night = nightHash(s.key);
    const receipt = {
      blockNumber: s.block.number,
      blockHash: s.block.hash,
      logs: [
        {
          address: s.d.NightFactory,
          blockNumber: s.block.number,
          blockHash: s.block.hash,
          transactionHash: s.block.hash,
          logIndex: 0,
          data: "0x",
          topics: encodeEventTopics({
            abi: s.d.abis.NightFactory ?? [],
            eventName: "NightOpened",
            args: { night, token: s.token, host: s.d.OWNER },
          }),
        },
      ],
    } as unknown as TransactionReceipt;
    await s.reader.ingest(receipt);
    await s.reader.ingest(receipt);
    const rows = s.ports.db.query("SELECT * FROM chain_nights").all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      night,
      token: s.token,
      block_number: 2n,
      block_hash: s.block.hash,
    });
    s.reset();
    expect(await s.reader.tokenOf(night)).toBe(s.token);
    expect(s.calls()).toBe(0);
  } finally {
    s.ports.db.close();
  }
});

test("pool batches all positions and caches by block hash", async () => {
  const s = await setup();
  try {
    s.ports.db
      .query("INSERT INTO chain_nights VALUES (?, ?, ?, ?, ?)")
      .run(s.reader.fingerprint, nightHash(s.key), s.token, 2, s.block.hash);
    await chainPool(s.ports, s.key);
    expect(s.calls()).toBe(3);
    await chainPool(s.ports, s.key);
    expect(s.calls()).toBe(4);
    s.block.hash = `0x${"34".repeat(32)}`;
    await chainPool(s.ports, s.key);
    expect(s.calls()).toBe(7);
    s.ports.db
      .query("INSERT OR REPLACE INTO chain_snapshots VALUES (?, ?, ?, ?, ?)")
      .run(
        s.reader.fingerprint,
        "market:paused",
        2,
        s.block.hash,
        serialize(true),
      );
    expect(
      (
        await chainDiscover(s, {
          city: "all",
          sort: DiscoverSort.RISK,
          soon: false,
          valueOnly: false,
          watchlist: false,
        })
      ).tradingPaused,
    ).toBe(true);
  } finally {
    s.ports.db.close();
  }
});

test("range poll projects logs and reorg replay removes orphaned nights", async () => {
  const s = await setup();
  try {
    let logs = [
      {
        address: s.d.NightFactory,
        blockNumber: 2n,
        blockHash: s.block.hash,
        transactionHash: s.block.hash,
        logIndex: 0,
        data: "0x",
        topics: encodeEventTopics({
          abi: s.d.abis.NightFactory ?? [],
          eventName: "NightOpened",
          args: { night: nightHash(s.key), token: s.token, host: s.d.OWNER },
        }),
      },
    ];
    let ranges = 0;
    s.reader.assertCurrent = async () => {};
    s.client.getLogs = (async ({
      fromBlock,
      toBlock,
    }: {
      fromBlock: bigint;
      toBlock: bigint;
    }) => {
      expect(fromBlock).toBe(1n);
      expect(toBlock).toBe(2n);
      ranges++;
      return logs;
    }) as typeof s.client.getLogs;
    await s.reader.poll(1000);
    expect(ranges).toBe(4);
    expect(
      s.ports.db.query("SELECT * FROM chain_market_snapshots").all(),
    ).toHaveLength(1);
    s.block.hash = `0x${"56".repeat(32)}`;
    logs = [];
    await s.reader.poll(1000);
    expect(ranges).toBe(7);
    expect(s.ports.db.query("SELECT * FROM chain_nights").all()).toHaveLength(
      0,
    );
    expect(
      s.ports.db.query("SELECT * FROM chain_market_snapshots").all(),
    ).toHaveLength(0);
  } finally {
    s.ports.db.close();
  }
});

test("busy-chain catch-up uses scoped 9999-block ranges and ABI-recorded creation topics", async () => {
  const s = await setup();
  try {
    const { default: recorded } = await import(
      "../../../ports/chain-reader/fixtures/night-opened.json"
    );
    const { default: deployed } = await import(
      "../../../../../../packages/contracts/deployments/5042002.json"
    );
    const { decodeEventLog } = await import("viem");
    expect(
      String(
        decodeEventLog({
          abi: deployed.abis.NightFactory as Abi,
          data: recorded.data as Hex,
          topics: recorded.topics as [Hex, ...Hex[]],
        }).eventName,
      ),
    ).toBe("NightOpened");
    s.d.NightFactory = recorded.address as Hex;
    s.block.number = 30000n;
    s.client.getBlock = (async ({
      blockNumber,
    }: {
      blockNumber?: bigint;
    } = {}) => ({
      ...s.block,
      number: blockNumber ?? s.block.number,
    })) as typeof s.client.getBlock;
    s.reader.assertCurrent = async () => {};
    const ranges: [bigint, bigint][] = [];
    let tokenQueried = false;
    s.client.getLogs = (async (request: {
      address: string[];
      fromBlock: bigint;
      toBlock: bigint;
      event?: { name: string };
      events?: unknown[];
      args?: { from?: string[]; to?: string[] };
    }) => {
      await Bun.sleep(2);
      expect(request.address.length).toBeGreaterThan(0);
      expect(request.toBlock - request.fromBlock).toBeLessThanOrEqual(9998n);
      if (request.address.includes(s.d.USDC)) {
        expect(request.event?.name).toBe("Transfer");
        expect(
          (request.args?.from ?? request.args?.to)?.length,
        ).toBeGreaterThan(0);
      }
      if (request.events) tokenQueried = true;
      if (!request.event && !request.events) {
        expect(request.address).not.toContain(s.d.USDC);
        ranges.push([request.fromBlock, request.toBlock]);
        if (request.fromBlock === 1n)
          return [
            {
              ...recorded,
              address: s.d.NightFactory,
              blockNumber: 500n,
              blockHash: s.block.hash,
              transactionHash: s.block.hash,
              logIndex: 2,
            },
          ];
      }
      return [];
    }) as typeof s.client.getLogs;
    // Construct after selecting the recorded deployment address.
    const reader = createChainReader(
      s.ports.db,
      s.d,
      s.client,
      s.reader.fingerprint,
    );
    reader.assertCurrent = async () => {};
    await reader.ready;
    const { catchUp } = await import("../../../dev/chain-check");
    const stats = await catchUp(reader, s.ports.db, 1n);
    expect(stats.blocksScanned).toBe(30000);
    expect(stats.logsIngested).toBe(1);
    expect(stats.nightsProjected).toBe(1);
    const seconds = stats.elapsedSeconds;
    console.info(
      `Mock catch-up: 30000 blocks / ${seconds.toFixed(3)}s = ${Math.round(30000 / seconds)} blocks/s (2ms getLogs latency).`,
    );
    expect(ranges).toEqual([
      [1n, 9999n],
      [10000n, 19998n],
      [19999n, 29997n],
      [29998n, 30000n],
    ]);
    expect(tokenQueried).toBe(true);
    expect(s.ports.db.query("SELECT * FROM chain_nights").all()).toHaveLength(
      1,
    );
    expect(s.ports.db.query("SELECT * FROM chain_events").all()).toHaveLength(
      1,
    );
  } finally {
    s.ports.db.close();
  }
});
