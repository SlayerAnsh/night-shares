import { expect, test } from "bun:test";
import { openDatabase } from "../../db/open-database";
import { loadDeployment } from "../arc-deployment/arc-deployment";
import type { ForkClient } from "../arc-deployment/validate";
import type { ChainReader } from "../chain-reader/chain-reader";
import { createPrivyWalletCustody } from "../wallet-custody/wallet-custody.privy";
import { persistWalletCustody } from "../wallet-custody/wallet-custody.sqlite";
import { createChainExecutor } from "./chain-executor.viem";

test("Privy chain executor boots and refuses execute/recover before RPC or journal writes", async () => {
  const db = openDatabase(":memory:");
  const deployment = loadDeployment("testnet");
  if (!deployment) throw new Error("Missing test deployment.");
  const custody = persistWalletCustody(
    db,
    "privy",
    createPrivyWalletCustody({
      appId: "dummy",
      appSecret: "dummy",
      fetch: async () => {
        throw new Error("Unexpected Privy call");
      },
    }),
  );
  try {
    const executor = createChainExecutor({
      db,
      deployment,
      client: {} as ForkClient,
      reader: { fingerprint: "public-testnet" } as ChainReader,
      custody,
      network: "testnet",
      sendingUnavailable: true,
    });
    expect(executor.mode).toBe("chain");
    await expect(
      executor.execute({
        operationId: "send",
        walletId: "unused",
        command: { kind: "verifyHuman", humanId: 1n, orb: true },
      }),
    ).rejects.toThrow("Privy transaction sending not implemented");
    await expect(executor.recover("send")).rejects.toThrow(
      "Privy transaction sending not implemented",
    );
    expect(executor.pending()).toEqual([]);
    expect(db.query("SELECT * FROM chain_operations").all()).toEqual([]);
    await expect(
      custody.signTransaction?.("unused", {} as never),
    ).rejects.toThrow("Privy transaction sending not implemented");
  } finally {
    db.close();
  }
});

test("public-chain attestation uses deployment chain ID", async () => {
  const { privateKeyToAccount } = await import("viem/accounts");
  const { verifyTypedData } = await import("viem");
  const { createChainAttester } = await import(
    "../chain-attester/chain-attester"
  );
  const key = `0x${"13".repeat(32)}` as const;
  const account = privateKeyToAccount(key);
  const d = loadDeployment("testnet");
  if (!d) throw new Error("Missing test deployment.");
  const { attester } = createChainAttester(
    { ...d, ATTESTER: account.address },
    () => key,
  );
  const message = { humanId: 1n, wallet: account.address, deadline: 100n };
  const signature = await attester.sign({ kind: "link", ...message });
  expect(
    await verifyTypedData({
      address: account.address,
      domain: {
        name: "NightShares",
        version: "1",
        chainId: 5042002,
        verifyingContract: d.HumanRegistry,
      },
      types: {
        LinkWallet: [
          { name: "humanId", type: "uint256" },
          { name: "wallet", type: "address" },
          { name: "deadline", type: "uint64" },
        ],
      },
      primaryType: "LinkWallet",
      message,
      signature,
    }),
  ).toBe(true);
});

test("public-chain execution estimates live gas without transfer simulation", async () => {
  const db = openDatabase(":memory:");
  const deployment = loadDeployment("testnet");
  if (!deployment) throw new Error("Missing test deployment.");
  let simulations = 0,
    estimates = 0;
  try {
    const executor = createChainExecutor({
      db,
      deployment,
      network: "testnet",
      client: {
        simulateContract: async () => {
          simulations++;
          throw new Error("Unsupported precompile");
        },
        estimateGas: async () => {
          estimates++;
          throw new Error("Stopped after live gas estimation");
        },
      } as unknown as ForkClient,
      reader: {
        fingerprint: "testnet",
        assertCurrent: async () => {},
      } as unknown as ChainReader,
      custody: {
        createWallet: async () => {
          throw new Error("unused");
        },
        getWallet: async () => undefined,
        signTypedData: async () => {
          throw new Error("unused");
        },
        resolveWallet: async () => ({
          walletId: "attester",
          address: deployment.ATTESTER,
        }),
        signTransaction: async () => {
          throw new Error("Must not sign");
        },
      },
    });
    await expect(
      executor.execute({
        operationId: "estimate",
        walletId: "attester",
        command: { kind: "verifyHuman", humanId: 1n, orb: true },
      }),
    ).rejects.toThrow("Stopped after live gas estimation");
    expect(simulations).toBe(0);
    expect(estimates).toBe(1);
  } finally {
    db.close();
  }
});
