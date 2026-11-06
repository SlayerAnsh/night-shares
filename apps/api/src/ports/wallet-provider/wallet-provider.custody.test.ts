import { expect, test } from "bun:test";
import { openDatabase } from "../../db/open-database";
import { createMockClock } from "../clock/clock.mock";
import { createMockIdGenerator } from "../ids/id-generator.mock";
import type { WalletCustody } from "../wallet-custody/wallet-custody";
import { persistWalletCustody } from "../wallet-custody/wallet-custody.sqlite";
import { createSqliteWalletProvider } from "./wallet-provider.sqlite";

test("new users get custody addresses; old users and system ledger aliases stay stable", async () => {
  const db = openDatabase(":memory:");
  const clock = createMockClock(0),
    ids = createMockIdGenerator();
  let creations = 0;
  const fake: WalletCustody = {
    async getWallet() {
      return undefined;
    },
    async createWallet() {
      creations++;
      return {
        walletId: `wallet_${creations}`,
        address: `0x${creations.toString(16).padStart(40, "0")}`,
      };
    },
    async signTypedData() {
      throw new Error("not used");
    },
  };
  try {
    const legacy = createSqliteWalletProvider({ db, clock, ids });
    const old = await legacy.linkWallet("old");
    const custody = persistWalletCustody(db, "privy", fake);
    const ledger = createSqliteWalletProvider({ db, clock, ids, custody });
    expect(await ledger.linkWallet("old")).toBe(old);
    expect(creations).toBe(0);
    const address = await ledger.linkWallet("new");
    expect(address).toBe(`0x${"0".repeat(39)}1`);
    expect(await ledger.linkWallet("new")).toBe(address);
    expect(creations).toBe(1);
    await ledger.transfer(address, "pool", 100n, "mock settlement");
    expect(
      (await custody.getWallet({ kind: "system", name: "pool" }))?.address,
    ).toBe(`0x${"0".repeat(39)}2`);
    expect((await ledger.transactions(address))[0]?.to).toBe("pool");
    expect(await ledger.balance(address)).toBe(12480000000n - 100n);
    const before = await ledger.balance("pool");
    await expect(
      ledger.settle([
        { from: address, to: "pool", amount: 1n, memo: "first" },
        { from: address, to: "pool", amount: 999999999999n, memo: "too much" },
      ]),
    ).rejects.toThrow("Not enough USDC");
    expect(await ledger.balance("pool")).toBe(before);
    expect(creations).toBe(2);
  } finally {
    db.close();
  }
});
