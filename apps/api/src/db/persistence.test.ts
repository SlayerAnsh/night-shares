import { expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryCatalogRepo } from "../modules/catalog-data/catalog-repo.memory";
import { createSqliteInventoryRepo } from "../modules/inventory/inventory-repo.sqlite";
import { createSqliteActivityLog } from "../ports/activity/activity-log.sqlite";
import { createMockClock } from "../ports/clock/clock.mock";
import { createMockIdGenerator } from "../ports/ids/id-generator.mock";
import { createSqliteSessionStore } from "../ports/sessions/session-store.sqlite";
import { createSqliteVerificationStore } from "../ports/verifications/verification-store.sqlite";
import { createSqliteWalletProvider } from "../ports/wallet-provider/wallet-provider.sqlite";
import { openDatabase } from "./open-database";

const key = "prop_velana:rt_velana_0:2026-12-24";
function stores(db: ReturnType<typeof openDatabase>) {
  const clock = createMockClock(Date.parse("2026-12-01T00:00:00Z"));
  const deps = {
    db,
    clock,
    ids: createMockIdGenerator(),
    catalog: createMemoryCatalogRepo(),
  };
  return {
    clock,
    inventory: createSqliteInventoryRepo(deps),
    activity: createSqliteActivityLog(deps),
    sessions: createSqliteSessionStore(deps),
    verifications: createSqliteVerificationStore(deps),
    wallet: createSqliteWalletProvider(deps),
  };
}

test("file database preserves inventory, activity, sessions and ledger across restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "night-shares-"));
  const path = join(directory, "nested", "test.db");
  let db = openDatabase(path);
  try {
    const first = stores(db);
    const night = first.inventory.update(key, (record) => ({
      ...record,
      stopped: true,
    }));
    const event = first.activity.append({
      nightKey: key,
      propertyId: night.propertyId,
      kind: "selling_stopped",
      actor: "host",
      tenths: 1,
      priceMicros: 9007199254740993n,
    });
    const address = await first.wallet.linkWallet("alice");
    const user = {
      id: "usr_alice",
      humanId: "alice",
      level: "orb" as const,
      walletAddress: address,
    };
    const token = first.sessions.create(user);
    const verification = first.verifications.issue({
      userId: user.id,
      action: "check_in",
    });
    const transfer = await first.wallet.transfer(
      address,
      "pool",
      1234567n,
      "buy",
    );
    const balance = await first.wallet.balance(address);
    const poolBalance = await first.wallet.balance("pool");
    db.close();
    db = openDatabase(path);
    const second = stores(db);
    expect(second.inventory.get(key)).toEqual(night);
    expect(second.activity.list({})).toEqual([event]);
    expect(second.sessions.get(token)).toEqual(user);
    expect(await second.wallet.linkWallet("alice")).toBe(address);
    expect(await second.wallet.balance(address)).toBe(balance);
    expect(await second.wallet.balance("pool")).toBe(poolBalance);
    expect((await second.wallet.transactions(address))[0]).toMatchObject({
      id: transfer,
      amount: 1234567n,
      direction: "out",
    });
    expect(
      second.verifications.consume({
        token: verification.token,
        userId: user.id,
        action: "check_in",
      }),
    ).toBe(true);
    expect(
      second.verifications.consume({
        token: verification.token,
        userId: user.id,
        action: "check_in",
      }),
    ).toBe(false);
    // Every migration file on disk is applied exactly once.
    const files = readdirSync(new URL("./migrations", import.meta.url)).filter(
      (name) => name.endsWith(".sql"),
    );
    expect(db.query("SELECT * FROM schema_migrations").all()).toHaveLength(
      files.length,
    );
    second.clock.advance(7 * 86400000);
    expect(second.sessions.get(token)).toBeUndefined();
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("inventory and wallet transactions roll back all writes when callbacks or ledger inserts fail", async () => {
  const db = openDatabase(":memory:");
  try {
    const { inventory, wallet } = stores(db);
    const before = inventory.get(key);
    expect(() =>
      inventory.update(key, (record) => {
        record.stopped = true;
        throw new Error("reject mutation");
      }),
    ).toThrow("reject mutation");
    expect(inventory.get(key)).toEqual(before);
    const address = await wallet.linkWallet("alice");
    const balance = await wallet.balance(address);
    await expect(
      wallet.settle([
        { from: address, to: "pool", amount: balance, memo: "first" },
        { from: address, to: "host", amount: 1n, memo: "second" },
      ]),
    ).rejects.toThrow("Not enough USDC.");
    db.exec(
      "CREATE TRIGGER reject_second BEFORE INSERT ON wallet_transactions WHEN NEW.memo = 'reject' BEGIN SELECT RAISE(ABORT, 'reject ledger'); END",
    );
    await expect(
      wallet.settle([
        { from: address, to: "pool", amount: 1n, memo: "first" },
        { from: address, to: "host", amount: 1n, memo: "reject" },
      ]),
    ).rejects.toThrow("reject ledger");
    expect(await wallet.balance(address)).toBe(balance);
    expect(await wallet.transactions(address)).toEqual([]);
  } finally {
    db.close();
  }
});

test("SQLite tokens expire and activity filters apply before limits", () => {
  const db = openDatabase(":memory:");
  try {
    const { activity, verifications, clock } = stores(db);
    const event = {
      nightKey: key,
      propertyId: "prop_velana",
      kind: "selling_stopped" as const,
      actor: "host" as const,
      tenths: 10,
    };
    const first = activity.append(event);
    activity.append({ ...event, propertyId: "other" });
    expect(activity.list({ propertyId: "prop_velana", limit: 1 })).toEqual([
      first,
    ]);
    expect(activity.list({ kinds: [] })).toEqual([]);
    expect(activity.list({ limit: 0 })).toEqual([]);
    const { token } = verifications.issue({
      userId: "alice",
      action: "check_in",
    });
    clock.advance(300000);
    expect(
      verifications.consume({ token, userId: "alice", action: "check_in" }),
    ).toBe(false);
  } finally {
    db.close();
  }
});

test("wallet money retains integer precision beyond JavaScript's safe number range", async () => {
  const db = openDatabase(":memory:");
  try {
    const { wallet } = stores(db);
    const amount = 9007199254740993n;
    db.query(
      "UPDATE wallet_balances SET balance_micros = ? WHERE address = 'treasury'",
    ).run(amount + 1n);
    const before = await wallet.balance("pool");
    await wallet.transfer("treasury", "pool", amount, "precision");
    expect(await wallet.balance("treasury")).toBe(1n);
    expect(await wallet.balance("pool")).toBe(before + amount);
    expect((await wallet.transactions("pool"))[0]?.amount).toBe(amount);
  } finally {
    db.close();
  }
});
