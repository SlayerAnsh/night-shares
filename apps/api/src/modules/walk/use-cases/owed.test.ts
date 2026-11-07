import { expect, test } from "bun:test";
import { createSqliteHostRepo } from "../../host/repo/host-repo.sqlite";
import { createGetPayout } from "../../host/use-cases/payout/get-payout";
import { createSweep } from "../../host/use-cases/payout/sweep";
import { fixture } from "../testing/fixture";
import { handleReport } from "./handle-report";

async function owedFixture() {
  const f = await fixture(0n);
  const balance = await f.ports.walletProvider.balance("cover_fund");
  await f.ports.walletProvider.transfer(
    "cover_fund",
    "pool",
    balance,
    "empty fund",
  );
  f.cases.tapReception(
    f.trip.id,
    f.cases.issueReceptionTag(f.trip.id, f.user.id).tagPayload,
    f.user.id,
  );
  return f;
}

test("empty fund persists owed and next sweep pays guest before host, once", async () => {
  const f = await owedFixture();
  const result = await handleReport(f.ports, f.report);
  expect(result.owedToGuest.micros).toBe(10000n);
  expect(result.paidToGuest.micros).toBe(0n);
  const repo = createSqliteHostRepo(f.ports);
  f.ports.db
    .query("INSERT INTO host_owners VALUES (?, ?)")
    .run(f.trip.propertyId, "host");
  const wallet = await f.ports.walletProvider.linkWallet("host");
  const before = await f.ports.walletProvider.balance(f.user.walletAddress);
  const gross = createGetPayout({ ports: f.ports, repo }, false)(
    "host",
    f.trip.propertyId,
  ).availableNow.micros;
  f.ports.db
    .query(
      "UPDATE host_cover_accounts SET spent = spent + ? WHERE property_id = ?",
    )
    .run(gross - 5000n, f.trip.propertyId);
  const sweep = createSweep({ ports: f.ports, repo });
  const first = await sweep("host", f.trip.propertyId, wallet);
  expect(first?.amount).toBe(0n);
  expect(await f.ports.walletProvider.balance(f.user.walletAddress)).toBe(
    before + 5000n,
  );
  expect(f.repo.trips.get(f.trip.id)?.trip.walk?.owedPaid?.micros).toBe(5000n);
  expect(await sweep("host", f.trip.propertyId, wallet)).toBeUndefined();
  f.ports.db.close();
});

test("FIFO claims allow partial payments and failed sweep restores claim balances", async () => {
  const f = await owedFixture();
  await handleReport(f.ports, f.report);
  const saved = f.repo.trips.get(f.trip.id);
  if (!saved) throw new Error("Missing trip");
  const second = structuredClone(saved);
  second.trip.id = "second_booking";
  f.repo.trips.set(second.trip.id, second);
  f.ports.db
    .query(`INSERT INTO walk_reports
    (id, booking_id, property_id, human_id, guest_id, reported_at, status, paid, from_pending, from_fund, owed_to_guest)
    VALUES ('second', ?, ?, 'guest', 'guest', ?, 'done', 10000, 0, 0, 10000)`)
    .run(second.trip.id, f.trip.propertyId, f.clock.now() + 1);
  const repo = createSqliteHostRepo(f.ports);
  f.ports.db
    .query("INSERT INTO host_owners VALUES (?, 'host')")
    .run(f.trip.propertyId);
  const wallet = await f.ports.walletProvider.linkWallet("host");
  const gross = createGetPayout({ ports: f.ports, repo }, false)(
    "host",
    f.trip.propertyId,
  ).availableNow.micros;
  f.ports.db
    .query(
      "UPDATE host_cover_accounts SET spent = spent + ? WHERE property_id = ?",
    )
    .run(gross - 12000n, f.trip.propertyId);
  const sweep = createSweep({ ports: f.ports, repo });
  const settle = f.ports.walletProvider.settle;
  f.ports.walletProvider.settle = async () => {
    throw new Error("offline");
  };
  await expect(sweep("host", f.trip.propertyId, wallet)).rejects.toThrow(
    "offline",
  );
  expect(
    f.ports.db.query("SELECT SUM(owed_paid) AS paid FROM walk_reports").get(),
  ).toEqual({ paid: 0n });
  expect(f.ports.db.query("SELECT 1 FROM walk_claim_locks").get()).toBeNull();
  f.ports.walletProvider.settle = settle;
  const result = await sweep("host", f.trip.propertyId, wallet);
  expect(result?.amount).toBe(0n);
  expect(
    f.ports.db
      .query("SELECT id, owed_paid FROM walk_reports ORDER BY reported_at")
      .all(),
  ).toEqual([
    { id: f.report.id, owed_paid: 10000n },
    { id: "second", owed_paid: 2000n },
  ]);
  expect(await sweep("host", f.trip.propertyId, wallet)).toBeUndefined();
  f.ports.db.close();
});

test("walk cannot reuse earnings consumed by a previous property sweep", async () => {
  const f = await fixture();
  const repo = createSqliteHostRepo(f.ports);
  f.ports.db
    .query("INSERT INTO host_owners VALUES (?, 'host')")
    .run(f.trip.propertyId);
  const wallet = await f.ports.walletProvider.linkWallet("host");
  await createSweep({ ports: f.ports, repo })(
    "host",
    f.trip.propertyId,
    wallet,
  );
  f.cases.tapReception(
    f.trip.id,
    f.cases.issueReceptionTag(f.trip.id, f.user.id).tagPayload,
    f.user.id,
  );
  const report = await handleReport(f.ports, f.report);
  expect(report.fromPending.micros).toBe(0n);
  expect(report.fromFund.micros).toBe(10000n);
  f.ports.db.close();
});
