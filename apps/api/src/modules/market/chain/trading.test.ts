import { expect, test } from "bun:test";
import type { ArcDeployment } from "../../../ports/arc-deployment/arc-deployment";
import type { ForkClient } from "../../../ports/arc-deployment/validate";
import {
  type Ask,
  serialize,
} from "../../../ports/chain-executor/chain-executor";
import type { ChainReader } from "../../../ports/chain-reader/chain-reader";
import { fixture } from "../testing/fixture";
import { configureChainMarket, nightHash } from "./runtime";
import { quoteChainTrade } from "./trading";

for (const approved of [false, true]) {
  test(`repeated buy and sell quotes send no transactions with approved=${approved}`, async () => {
    const deps = await fixture();
    const { ports, user, key } = deps;
    const wallet = {
      walletId: "quote-wallet",
      address: "0x0000000000000000000000000000000000000001" as const,
    };
    const block = {
      number: 1n,
      timestamp: 1n,
      hash: `0x${"00".repeat(32)}` as const,
    };
    const amount = approved ? 10n ** 20n : 0n;
    let transactions = 0;
    ports.chainExecutor = {
      mode: "chain",
      pending: () => [],
      recover: async () => {
        throw new Error("unused");
      },
      execute: async () => {
        transactions++;
        throw new Error("Quote sent a transaction");
      },
    };
    ports.chainReader = {
      fingerprint: "quotes",
      assertCurrent: async () => {},
      head: async () => block,
      cash: async () => ({ block, value: { native: 1n, usdc: 0n } }),
      async read<T>(request: Parameters<ChainReader["read"]>[0]) {
        return {
          block,
          value: (request.functionName === "config"
            ? { F: 10000n, k: 10n ** 18n, S: 10n ** 19n, cutoff: 1000000n }
            : request.functionName === "held"
              ? 0n
              : request.functionName === "humanBalance"
                ? 5n * 10n ** 17n
                : request.functionName === "isOrb"
                  ? true
                  : request.contract === "PERMIT2"
                    ? [approved ? 500000n : 0n, 10000, 0]
                    : request.contract === "USDC"
                      ? approved
                        ? 750000n
                        : 0n
                      : amount) as T,
        };
      },
      tokenOf: async () => wallet.address,
      ingest: async () => {},
      poll: async () => block,
      watch: () => {},
      simulate: async () => {
        throw new Error("Quote must use state overrides");
      },
    };
    const custody = {
      getWallet: async () => wallet,
      createWallet: async () => wallet,
      signTypedData: async () => "0x" as const,
    };
    configureChainMarket(ports, {
      custody,
      client: {
        getBlock: async () => block,
        multicall: async (request: {
          contracts: { functionName: string }[];
        }) =>
          request.contracts[0]?.functionName === "config"
            ? [
                { F: 10000n, k: 10n ** 18n, S: 10n ** 19n, cutoff: 1000000n },
                0n,
                0n,
                true,
                false,
                false,
                0n,
              ]
            : request.contracts[0]?.functionName === "nonces"
              ? request.contracts.map((_, i) => (i % 3 === 2 ? 10n ** 18n : 0n))
              : request.contracts.map(() => `0x${"00".repeat(32)}`),
        readContract: async (request: { functionName: string }) =>
          request.functionName === "extsload"
            ? `0x${"00".repeat(32)}`
            : 123456789n,
        simulateContract: async (request: {
          account: string;
          stateOverride: unknown[];
          functionName: string;
          args: unknown[];
        }) => {
          if (request.functionName === "buy") {
            const asks = request.args[3] as Ask[];
            expect(asks).toHaveLength(50);
            expect(asks.map((ask) => ask.order.price)).toEqual(
              Array.from({ length: 50 }, (_, i) => BigInt(i + 1)),
            );
          }
          expect(request.account).toBe(wallet.address);
          expect(request.stateOverride.length).toBeGreaterThan(0);
          return { result: 100n };
        },
      } as unknown as ForkClient,
      deployment: {
        NightHook: wallet.address,
        NightVault: wallet.address,
        POOL_MANAGER: wallet.address,
        USDC: wallet.address,
        PERMIT2: wallet.address,
        TradeRouter: wallet.address,
        abis: { TradeRouter: [] },
      } as unknown as ArcDeployment,
    });
    for (let i = 0; i < 200; i++) {
      ports.db
        .query(
          "INSERT INTO market_chain_asks VALUES (?, ?, ?, ?, ?, ?, ?, 'open')",
        )
        .run(
          "quotes",
          key,
          wallet.address,
          user.humanId,
          wallet.walletId,
          `0x${i.toString(16).padStart(64, "0")}`,
          serialize({
            order: {
              night: nightHash(key),
              maker: wallet.address,
              size: 10n ** 18n,
              price: BigInt(200 - i),
              expiry: 1000n,
              nonce: 0n,
            },
            signature: "0x",
            qty: 0n,
          }),
        );
    }
    const journal = ports.db.query("SELECT * FROM chain_operations").all();
    try {
      for (let i = 0; i < 4; i++) {
        for (const kind of ["buy", "sell"] as const) {
          const quote = quoteChainTrade(deps, key, 2, user, kind, wallet);
          const result = await quote;
          expect(result.total?.micros).toBe(100n);
          expect(result.capUsed?.tenths).toBe(5);
          expect(result.cap?.tenths).toBe(30);
        }
      }
      expect(transactions).toBe(0);
      expect(ports.db.query("SELECT * FROM chain_operations").all()).toEqual(
        journal,
      );
      expect(
        ports.db.query("SELECT * FROM market_chain_preparations").all(),
      ).toHaveLength(0);
    } finally {
      ports.db.close();
    }
  });
}

test("testnet quotes project live pool positions without USDC simulation", async () => {
  const { toHex } = await import("viem");
  const { simulateQuote } = await import("./quote-simulation");
  const deps = await fixture();
  const { ports, key } = deps;
  const address = "0x0000000000000000000000000000000000000001" as const;
  const block = {
    number: 71115581n,
    timestamp: 1n,
    hash: `0x${"00".repeat(32)}` as const,
  };
  let storageReads = 0;
  ports.chainExecutor = { mode: "chain" } as NonNullable<
    typeof ports.chainExecutor
  >;
  ports.chainReader = {
    fingerprint: "testnet-pool",
    head: async () => block,
    assertCurrent: async () => {},
    tokenOf: async () => address,
    async read<T>(request: Parameters<ChainReader["read"]>[0]) {
      const values: Record<string, unknown> = {
        config: { F: 500000n, k: 10n ** 18n, S: 10n ** 19n, cutoff: 1000000n },
        held: 0n,
        ladderComplete: true,
        closed: false,
        paused: false,
      };
      return { block, value: values[request.functionName] as T };
    },
  } as unknown as ChainReader;
  configureChainMarket(ports, {
    network: "testnet",
    custody: {} as never,
    deployment: {
      abis: {},
      NightHook: address,
      NightVault: address,
      POOL_MANAGER: address,
      USDC: address,
    } as unknown as ArcDeployment,
    client: {
      getBlock: async () => block,
      multicall: async (request: { contracts: { functionName: string }[] }) =>
        request.contracts[0]?.functionName === "config"
          ? [
              { F: 500000n, k: 10n ** 18n, S: 10n ** 19n, cutoff: 1000000n },
              0n,
              0n,
              true,
              false,
              false,
              0n,
            ]
          : request.contracts.map(() =>
              toHex(
                storageReads++ === 0
                  ? BigInt(Math.floor((Math.sqrt(0.5) / 1e6) * 2 ** 96))
                  : 100n * 10n ** 12n,
                { size: 32 },
              ),
            ),
      simulateContract: async () => {
        throw new Error("Arc USDC precompile simulation must not run");
      },
    } as unknown as ForkClient,
  });
  try {
    const quote = await simulateQuote(
      ports,
      {
        kind: "buy",
        night: `0x${"00".repeat(32)}`,
        qty: 10n ** 18n,
        maxPaid: 1000000n,
        asks: [],
        hints: [],
        deadline: 100n,
      },
      address,
      key,
    );
    expect(quote.block.number).toBe(71115581n);
    expect(quote.value).toBeGreaterThanOrEqual(500000n);
    expect(quote.value).toBeLessThan(600000n);
    expect(storageReads).toBe(11);
  } finally {
    ports.db.close();
  }
});
