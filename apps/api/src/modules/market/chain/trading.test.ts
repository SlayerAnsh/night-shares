import { expect, test } from "bun:test";
import type { ArcDeployment } from "../../../ports/arc-deployment/arc-deployment";
import type { ForkClient } from "../../../ports/arc-deployment/validate";
import type { ChainReader } from "../../../ports/chain-reader/chain-reader";
import { fixture } from "../testing/fixture";
import { configureChainMarket } from "./runtime";
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
      mode: "fork",
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
        readContract: async (request: { functionName: string }) =>
          request.functionName === "extsload"
            ? `0x${"00".repeat(32)}`
            : 123456789n,
        simulateContract: async (request: {
          account: string;
          stateOverride: unknown[];
        }) => {
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
