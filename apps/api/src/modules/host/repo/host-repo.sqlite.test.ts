import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildContainer } from "../../../container/build-container";
import { mockSubjectFor } from "../../../ports/identity-verifier/identity-verifier.mock";
import { createHostUseCases } from "../use-cases/create-host-use-cases";
import { fixture } from "../use-cases/fixture";
import { createSweep } from "../use-cases/payout/sweep";
import { createSqliteHostRepo } from "./host-repo.sqlite";

function open(path: string) {
  const { ports } = buildContainer({
    adapters: "mock",
    port: 0,
    dbPath: path,
    today: "2026-12-01",
    clock: "mock",
    ids: "random",
  });
  const repo = createSqliteHostRepo(ports);
  return { ports, repo, use: createHostUseCases({ ports, repo }) };
}

test("host ownership, imports, withdrawals and opened nights survive a file database restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "night-shares-host-"));
  const path = join(directory, "host.db");
  let f = open(path);
  const original = fixture();
  const { selection, key } = original;
  original.ports.db.close();
  try {
    const user = {
      id: "usr_host",
      humanId: mockSubjectFor("host"),
      level: "orb" as const,
      walletAddress: await f.ports.walletProvider.linkWallet("host"),
    };
    expect(() => f.repo.claim("other", "prop_velana")).toThrow(
      "managed by another host",
    );
    f.repo.initialize(user);
    await f.use.connectChannelManager("other", "prop_salinas", 2);
    const imported = f.repo.connections("other").get("prop_salinas");
    const room = imported?.roomTypes[0];
    expect(room).toHaveProperty("usualRate");
    // Imported rates and withdrawals must retain all 64-bit integer digits.
    if (imported && room) {
      imported.roomTypes[0] = {
        ...room,
        usualRate: 9007199254740993n,
      } as typeof room;
      f.repo.connections("other").set("prop_salinas", imported);
    }
    f.ports.inventory.update(key, (record) => ({
      ...record,
      stopped: true,
      openedAt: 0,
    }));
    await f.use.openNights(user.id, selection);
    const night = f.ports.inventory.get(key);
    expect(night.openedAt).toBe(f.ports.clock.now());
    const swept = await createSweep(f)(
      user.id,
      "prop_velana",
      user.walletAddress,
    );
    f.repo.addWithdrawal("prop_salinas", 9007199254740993n);
    const payout = f.use.getPayout(user.id, "prop_velana");
    f.ports.db.close();
    f = open(path);
    f.repo.initialize(user);
    expect(f.repo.owner("prop_velana")).toBe(user.id);
    expect(f.repo.connections(user.id).size).toBe(4);
    expect(f.repo.owner("prop_salinas")).toBe("other");
    expect(f.repo.connections("other").get("prop_salinas")).toEqual(imported);
    expect(f.repo.withdrawn("prop_velana")).toBe(swept?.amount ?? 0n);
    expect(f.repo.withdrawn("prop_salinas")).toBe(9007199254740993n);
    expect(f.use.getPayout(user.id, "prop_velana")).toEqual(payout);
    expect(f.repo.release(key)).toBe(selection.releasePolicy);
    expect(f.ports.inventory.get(key)).toEqual(night);
    expect(() => f.repo.claim("third", "prop_salinas")).toThrow(
      "managed by another host",
    );
  } finally {
    f.ports.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("connection maps write through without retaining rolled back or stale values", async () => {
  const f = open(":memory:");
  try {
    const map = f.repo.connections("host");
    const connection = { pms: "Mews", roomTypes: [] };
    map.set("prop_salinas", connection);
    expect(map.size).toBe(1);
    f.repo
      .connections("host")
      .set("prop_salinas", { ...connection, pms: "Cloudbeds" });
    expect(map.get("prop_salinas")?.pms).toBe("Cloudbeds");
    expect([...map.keys()]).toEqual(["prop_salinas"]);
    expect(map.delete("prop_salinas")).toBe(true);
    expect(map.delete("prop_salinas")).toBe(false);
    map.set("prop_machiya", connection);
    map.clear();
    expect([...map]).toEqual([]);
  } finally {
    f.ports.db.close();
  }
});
