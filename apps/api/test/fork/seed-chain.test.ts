import { expect, test } from "bun:test";
import { parseEther, testActions, toHex } from "viem";
import { buildContainer } from "../../src/container/build-container";
import {
  assertSeedBudget,
  seedChain,
  seedConfig,
  traderAmount,
} from "../../src/dev/seed-chain";
import { isolatedHostFork } from "../../src/modules/host/chain/fork-fixture";
import { assertLocalForkRpc } from "../../src/ports/arc-deployment/local-fork";
import { forkClient } from "../../src/ports/arc-deployment/validate";
import { anvilAccount } from "../../src/ports/wallet-custody/wallet-custody.anvil";

test("chain seed refuses mainnet and disabled execution before loading credentials", () => {
  expect(() => seedConfig({ ARC_NETWORK: "mainnet" })).toThrow(
    "refuses mainnet",
  );
  expect(() =>
    seedConfig({ ARC_NETWORK: "testnet", CHAIN_EXECUTION: "off" }),
  ).toThrow("CHAIN_EXECUTION=off");
  expect(() =>
    seedConfig({ ARC_NETWORK: "testnet", WALLET_CUSTODY: "anvil" }),
  ).toThrow("WALLET_CUSTODY=privy");
});

test("seed budget includes three floats, trader ERC-20 and reserve, with exact shortfall", () => {
  const check = (balance: string) =>
    assertSeedBudget(
      parseEther(balance),
      2_000_000n,
      parseEther("0.15"),
      traderAmount(),
      parseEther("0.1"),
    );
  expect(() => check("2.24")).toThrow("0.01 native USDC");
  expect(check("2.25").requiredBalance).toBe("2.25");
  expect(() =>
    assertSeedBudget(
      parseEther("2.25"),
      2_000_000n,
      parseEther("0.15"),
      traderAmount(),
      parseEther("0.1"),
      parseEther("0.01"),
    ),
  ).toThrow("0.01 native USDC");
  expect(() =>
    assertSeedBudget(parseEther("3"), 1_000_000n, 0n, traderAmount(), 0n),
  ).toThrow("1 ERC-20 USDC");
  for (const value of ["-1", "0", "1.0000001", "NaN"])
    expect(() => traderAmount(value)).toThrow();
});

(process.env.FORK_IT === "1" ? test : test.skip)(
  "Privy-shaped seed on child fork: budget before sends, catalog nights and idempotent funding",
  async () => {
    const upstream = process.env.ARC_RPC_URL ?? "http://127.0.0.1:8545";
    assertLocalForkRpc(upstream);
    const child = await isolatedHostFork(
      upstream,
      Number(await forkClient(upstream).getBlockNumber()),
    );
    const originalFetch = globalThis.fetch;
    const accounts = new Map<string, ReturnType<typeof anvilAccount>>();
    let container: ReturnType<typeof buildContainer> | undefined;
    try {
      // Intercept Privy entirely in-process; only child-fork RPC leaves this stub.
      globalThis.fetch = Object.assign(
        async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
          const url = String(input);
          if (!url.startsWith("https://api.privy.io/v1/wallets"))
            return originalFetch(input, init);
          const path = new URL(url).pathname.replace("/v1/wallets", "");
          const body = init?.body ? JSON.parse(String(init.body)) : undefined;
          if (!path && body) {
            const id = `ext_wal_${body.external_id}`;
            if (!accounts.has(id))
              accounts.set(id, anvilAccount(89001 + accounts.size));
            return Response.json({
              id,
              address: accounts.get(id)?.address,
              chain_type: "ethereum",
            });
          }
          const id = path.split("/")[1] ?? "";
          const account = accounts.get(id);
          if (!account) return new Response(null, { status: 404 });
          if (path.endsWith("/rpc")) {
            const tx = body.params.transaction;
            const signed = await account.signTransaction({
              chainId: tx.chain_id,
              type: "eip1559",
              nonce: tx.nonce,
              to: tx.to,
              data: tx.data,
              value: BigInt(tx.value),
              gas: BigInt(tx.gas_limit),
              maxFeePerGas: BigInt(tx.max_fee_per_gas),
              maxPriorityFeePerGas: BigInt(tx.max_priority_fee_per_gas),
            });
            return Response.json({
              method: body.method,
              data: { encoding: "rlp", signed_transaction: signed },
            });
          }
          return Response.json({
            id,
            address: account.address,
            chain_type: "ethereum",
          });
        },
        originalFetch,
      );
      const opsKey = anvilAccount(0).getHdKey().privateKey;
      if (!opsKey) throw new Error("Missing fixture key.");
      const config = seedConfig({
        ARC_NETWORK: "fork",
        ARC_RPC_URL: child.rpcUrl,
        ARC_RPC_URLS: child.rpcUrl,
        DB_PATH: ":memory:",
        WALLET_CUSTODY: "privy",
        PRIVY_APP_ID: "stub",
        PRIVY_APP_SECRET: "stub",
        OPS_KEY: toHex(opsKey),
        ARC_DEPLOYMENT_FILE: process.env.ARC_DEPLOYMENT_FILE,
      });
      container = buildContainer(config);
      const client = forkClient(child.rpcUrl);
      const ops = anvilAccount(0).address;
      const original = await client.getBalance({ address: ops });
      await client
        .extend(testActions({ mode: "anvil" }))
        .setBalance({ address: ops, value: parseEther("0.1") });
      await expect(seedChain(container, config)).rejects.toThrow("shortfall");
      expect(
        container.ports.db.query("SELECT * FROM chain_operations").all(),
      ).toHaveLength(0);
      await client
        .extend(testActions({ mode: "anvil" }))
        .setBalance({ address: ops, value: original });
      await container.ports.chainExecutor?.execute({
        operationId: "fixture-ops-cash",
        walletId: "chain:ops",
        command: { kind: "provisionToken", to: ops, amount: 10_000_000n },
      });
      const first = await seedChain(container, config);
      const count = container.ports.db
        .query("SELECT * FROM chain_operations")
        .all().length;
      const second = await seedChain(container, config, traderAmount("3"));
      expect(second.nights).toEqual(first.nights);
      expect(second.wallet).toBe(first.wallet);
      expect(accounts.size).toBe(2);
      expect(
        container.ports.db.query("SELECT * FROM chain_operations").all(),
      ).toHaveLength(count);
      expect(first.nights).toHaveLength(2);
      for (const key of first.nights) {
        expect(key).toMatch(/^prop_.*:rt_.*:/);
        expect(container.ports.inventory.get(key).state.F).toBe(0.5);
        expect(container.ports.inventory.get(key).state.S).toBeLessThanOrEqual(
          10,
        );
      }
      expect(
        (await container.ports.chainReader?.cash(first.wallet as `0x${string}`))
          ?.value.usdc,
      ).toBe(2_000_000n);
    } finally {
      globalThis.fetch = originalFetch;
      container?.ports.db.close();
      child.stop();
    }
  },
  300000,
);
