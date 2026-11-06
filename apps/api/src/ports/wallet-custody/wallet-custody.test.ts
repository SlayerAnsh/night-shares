import { expect, test } from "bun:test";
import { openDatabase } from "../../db/open-database";
import { createMockWalletCustody } from "./wallet-custody.mock";
import { persistWalletCustody } from "./wallet-custody.sqlite";

test("creation is idempotent across concurrent calls and adapter restarts", async () => {
  const db = openDatabase(":memory:");
  try {
    const owner = { kind: "user" as const, humanId: "alice" };
    let calls = 0;
    const mock = createMockWalletCustody();
    const adapter = {
      ...mock,
      async createWallet(input: typeof owner) {
        calls++;
        return mock.createWallet(input);
      },
    };
    const custody = persistWalletCustody(db, "mock", adapter);
    const [first, second] = await Promise.all([
      custody.createWallet(owner),
      custody.createWallet(owner),
    ]);
    expect(first).toEqual(second);
    expect(calls).toBe(1);
    const reopened = persistWalletCustody(
      db,
      "mock",
      createMockWalletCustody(),
    );
    expect(await reopened.getWallet(owner)).toEqual(first);
    expect(await reopened.createWallet(owner)).toEqual(first);
    expect(
      await custody.createWallet({ kind: "system", name: "alice" }),
    ).not.toEqual(first);
  } finally {
    db.close();
  }
});

test("failed creation can retry without persisting a partial wallet", async () => {
  const db = openDatabase(":memory:");
  try {
    const mock = createMockWalletCustody();
    let fail = true;
    const custody = persistWalletCustody(db, "privy", {
      ...mock,
      async createWallet(owner) {
        if (fail) {
          fail = false;
          throw new Error("offline");
        }
        return mock.createWallet(owner);
      },
    });
    const owner = { kind: "system" as const, name: "pool" };
    await expect(custody.createWallet(owner)).rejects.toThrow("offline");
    expect(await custody.getWallet(owner)).toBeUndefined();
    expect((await custody.createWallet(owner)).address).toMatch(/^0x/);
  } finally {
    db.close();
  }
});
