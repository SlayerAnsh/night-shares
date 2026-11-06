import { expect, test } from "bun:test";
import { createSqliteHostRepo } from "../repo/host-repo.sqlite";
import { createHostUseCases } from "./create-host-use-cases";
import { fixture } from "./fixture";

function setup() {
  const f = fixture();
  const repo = createSqliteHostRepo(f.ports);
  repo.claim(f.userId, "prop_salinas");
  const use = createHostUseCases({ ports: f.ports, repo });
  const selection = {
    ...f.selection,
    propertyId: "prop_salinas",
    roomTypeIds: ["rt_salinas_0"],
    dates: ["2026-12-24", "2026-12-25"],
  };
  return { ...f, repo, use, selection };
}

test("opening rolls back all inventory, release policies and activity if metadata fails", () => {
  const f = setup();
  try {
    const keys = f.selection.dates.map(
      (date) => `prop_salinas:rt_salinas_0:${date}`,
    );
    const before = keys.map((key) => f.ports.inventory.get(key));
    f.ports.db.exec(`CREATE TRIGGER reject_release BEFORE INSERT ON host_releases
      WHEN NEW.night_key = '${keys[1]}' BEGIN SELECT RAISE(ABORT, 'reject release'); END`);
    expect(() => f.use.openNights(f.userId, f.selection)).toThrow(
      "reject release",
    );
    expect(keys.map((key) => f.ports.inventory.get(key))).toEqual(before);
    expect(f.ports.db.query("SELECT * FROM host_releases").all()).toEqual([]);
    expect(f.ports.activity.list({ propertyId: "prop_salinas" })).toEqual([]);
  } finally {
    f.ports.db.close();
  }
});

test("failed connection import rolls back ownership and connection together", async () => {
  const f = setup();
  try {
    f.ports.db.exec(`CREATE TRIGGER reject_import BEFORE INSERT ON host_room_types
      BEGIN SELECT RAISE(ABORT, 'reject import'); END`);
    await expect(
      f.use.connectChannelManager("other", "prop_machiya", 1),
    ).rejects.toThrow("reject import");
    expect(f.repo.owner("prop_machiya")).toBeUndefined();
    expect(f.repo.connections("other").size).toBe(0);
  } finally {
    f.ports.db.close();
  }
});

test("SQLite withdrawal reserves once and compensates failed settlement", async () => {
  const f = setup();
  try {
    const user = {
      id: f.userId,
      humanId: "host",
      level: "orb" as const,
      walletAddress: await f.ports.walletProvider.linkWallet("host"),
    };
    const before = f.use.getPayout(user.id, "prop_salinas");
    const settle = f.ports.walletProvider.settle;
    f.ports.walletProvider.settle = async () => {
      throw new Error("provider unavailable");
    };
    await expect(f.use.withdraw(user, "prop_salinas", 1n)).rejects.toThrow(
      "provider unavailable",
    );
    expect(f.repo.withdrawn("prop_salinas")).toBe(0n);
    expect(f.use.getPayout(user.id, "prop_salinas")).toEqual(before);
    f.ports.walletProvider.settle = settle;
    const results = await Promise.allSettled([
      f.use.withdraw(user, "prop_salinas"),
      f.use.withdraw(user, "prop_salinas"),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(f.repo.withdrawn("prop_salinas")).toBe(before.availableNow.micros);
  } finally {
    f.ports.db.close();
  }
});
