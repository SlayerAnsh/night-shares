import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyTypedData } from "viem";
import { orderTypedData } from "../../modules/market/orders/typed-data";
import { parseDeployment } from "../arc-deployment/arc-deployment";
import { fixture } from "../arc-deployment/fixture";
import { anvilAccount, createAnvilWalletCustody } from "./wallet-custody.anvil";

test("anvil allocates deterministic persisted user and system indices and signs locally", async () => {
  const dir = mkdtempSync(join(tmpdir(), "anvil-custody-"));
  const path = join(dir, "wallets.db");
  let db = new Database(path);
  const deployment = parseDeployment(fixture());
  const create = () =>
    createAnvilWalletCustody({
      db,
      network: "fork",
      deployment,
      rpcUrl: "http://127.0.0.1:1",
    });
  try {
    const custody = create();
    const owner = { kind: "user" as const, humanId: "alice" };
    const [wallet, duplicate] = await Promise.all([
      custody.createWallet(owner),
      custody.createWallet(owner),
    ]);
    expect(wallet).toEqual(duplicate);
    expect(wallet.address).toBe(anvilAccount(100).address);
    expect(
      (await custody.createWallet({ kind: "system", name: "pool" })).address,
    ).toBe(anvilAccount(101).address);
    db.close();
    db = new Database(path);
    expect(await create().createWallet(owner)).toEqual(wallet);
    const data = JSON.parse(
      orderTypedData(
        {
          night: "demo",
          size: 1,
          price: 1n,
          expiry: 1800000000000,
          nonce: 0n,
          maker: wallet.address,
        },
        deployment.EIP712Domain,
      ).typedDataJson,
    );
    const signature = await create().signTypedData(wallet.walletId, data);
    expect(
      await verifyTypedData({ ...data, address: wallet.address, signature }),
    ).toBe(true);
    for (const index of [7, 8, 9]) {
      await expect(
        create().signTypedData(`anvil:${index}`, data),
      ).rejects.toThrow("Unknown");
      expect(() =>
        db
          .query("INSERT INTO anvil_wallets VALUES (?, ?, ?, ?)")
          .run(
            `reserved:${index}`,
            index,
            `anvil:${index}`,
            anvilAccount(index).address,
          ),
      ).toThrow("CHECK");
    }
    expect(() =>
      createAnvilWalletCustody({
        db,
        network: "mainnet",
        deployment,
        rpcUrl: "http://127.0.0.1:1",
      }),
    ).toThrow("requires");
  } finally {
    db.close();
    rmSync(dir, { recursive: true });
  }
});
