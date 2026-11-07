import { expect, test } from "bun:test";
import type { Hex } from "viem";
import { executionFixture } from "../../../ports/arc-deployment/fixture";
import type { ForkClient } from "../../../ports/arc-deployment/validate";
import { serialize } from "../../../ports/chain-executor/chain-executor";
import type { ChainReader } from "../../../ports/chain-reader/chain-reader";
import { fixture } from "../testing/fixture";
import { cancelChainAsks, liveAsks } from "./asks";
import { chainPortfolio } from "./positions";
import { configureChainMarket, nightHash } from "./runtime";

test("large books close stale asks and return all live asks with bounded multicalls", async () => {
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
    expect(asks).toHaveLength(605);
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

test("portfolio retains an expensive maker ask through another listing's cancellation", async () => {
  const deps = await fixture();
  const d = executionFixture();
  const wallet = { walletId: "maker", address: d.OWNER };
  deps.user.walletAddress = wallet.address;
  const second = `${deps.key}-other`;
  let nonce = 0n;
  const block = { number: 10n, timestamp: 100n, hash: `0x${"11".repeat(32)}` };
  deps.ports.inventory.list = () => [deps.ports.inventory.get(deps.key)];
  deps.ports.chainReader = {
    fingerprint: "asks",
    head: async () => block,
    poll: async () => block,
    tokenOf: async () => d.NightToken,
    read: async ({ functionName }: { functionName: string }) => ({
      block,
      value:
        functionName === "tokenOf"
          ? d.NightToken
          : functionName === "nonces"
            ? nonce
            : functionName === "balanceOf"
              ? 10n ** 18n
              : 0n,
    }),
  } as unknown as ChainReader;
  deps.ports.chainExecutor = {
    mode: "chain",
    execute: async () => {
      nonce++;
      return {
        state: "finalized",
        receipt: { status: "success", transactionHash: block.hash },
      };
    },
  } as never;
  configureChainMarket(deps.ports, {
    deployment: d,
    custody: {
      getWallet: async (owner: { kind: string }) =>
        owner.kind === "user" ? wallet : undefined,
      resolveWallet: async () => wallet,
      signTypedData: async () => "0x1234",
    } as never,
    client: {
      multicall: async ({ contracts }: { contracts: { args: string[] }[] }) =>
        contracts.map((contract, i) =>
          i % 3 === 0
            ? contract.args[0]?.toLowerCase() === d.OWNER.toLowerCase()
              ? nonce
              : 0n
            : i % 3 === 1
              ? 0n
              : 10n ** 18n,
        ),
    } as unknown as ForkClient,
  });
  try {
    for (let i = 0; i < 52; i++) {
      const maker = i < 50 ? d.PLATFORM : d.OWNER;
      deps.ports.db
        .query(
          "INSERT INTO market_chain_asks VALUES (?, ?, ?, ?, ?, ?, ?, 'open')",
        )
        .run(
          "asks",
          i === 51 ? second : deps.key,
          maker,
          deps.user.humanId,
          wallet.walletId,
          `0x${i.toString(16).padStart(64, "0")}`,
          serialize({
            order: {
              night: nightHash(i === 51 ? second : deps.key),
              maker,
              price: BigInt(i + 1),
              expiry: 200n,
              nonce: 0n,
              size: 10n ** 18n,
            },
            signature: `0x${i.toString(16).padStart(2, "0")}`,
            qty: 10n ** 18n,
          }),
        );
    }
    expect(
      (await liveAsks(deps, deps.key))
        .slice(0, 50)
        .some((a) => a.order.maker === d.OWNER),
    ).toBe(false);
    expect(await liveAsks(deps, deps.key, { maker: d.OWNER })).toHaveLength(1);
    expect((await chainPortfolio(deps, deps.user)).listings).toHaveLength(1);
    const result = await cancelChainAsks(
      deps,
      deps.user,
      `${second}|${wallet.address}`,
    );
    expect(result.resignedAskIds).toEqual([`${deps.key}|${wallet.address}`]);
    const portfolio = await chainPortfolio(deps, deps.user);
    expect(portfolio.listings).toHaveLength(1);
    expect(portfolio.listings[0]?.price?.micros).toBe(51n);
    expect(portfolio.listings[0]?.nonce).toBe(1n);
  } finally {
    deps.ports.db.close();
  }
});
