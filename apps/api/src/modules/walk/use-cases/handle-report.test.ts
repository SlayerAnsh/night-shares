import { expect, test } from "bun:test";
import { coverAccount } from "../repo/cover-accounts";
import { walkIncidents } from "../repo/incidents";
import { fixture } from "../testing/fixture";
import { handleReport } from "./handle-report";
import { markWalkFalse } from "./mark-false";

test("walk settles once, preserves holders and night, and publishes an incident", async () => {
  const f = await fixture();
  f.cases.tapReception(f.trip.id, f.trip.propertyId, f.user.id);
  const night = f.ports.inventory.get(f.key);
  const before = await f.ports.walletProvider.balance(f.user.walletAddress);
  const account = coverAccount(f.ports.db, f.trip.propertyId);
  const result = await handleReport(f.ports, f.report);
  expect(result.paidToGuest.micros).toBe(20000n);
  expect(await f.ports.walletProvider.balance(f.user.walletAddress)).toBe(
    before + 20000n,
  );
  expect(coverAccount(f.ports.db, f.trip.propertyId)).toEqual({
    spent: account.spent + 12000n,
    debt: 8000n,
  });
  expect(f.ports.inventory.get(f.key)).toEqual(night);
  expect(walkIncidents(f.ports.db, f.trip.propertyId)).toHaveLength(1);
  await expect(
    handleReport(f.ports, { ...f.report, id: "another" }),
  ).rejects.toThrow("already has a walk report");
  expect(() => f.cases.checkIn(f.trip.id, "token", f.user.id)).toThrow(
    "has a walk report",
  );
});
test("failed settlement compensates pending, debt and report and permits retry", async () => {
  const f = await fixture();
  f.cases.tapReception(f.trip.id, f.trip.propertyId, f.user.id);
  const account = coverAccount(f.ports.db, f.trip.propertyId);
  const settle = f.ports.walletProvider.settle;
  f.ports.walletProvider.settle = async () => {
    throw new Error("offline");
  };
  await expect(handleReport(f.ports, f.report)).rejects.toThrow("offline");
  expect(coverAccount(f.ports.db, f.trip.propertyId)).toEqual(account);
  expect(f.ports.db.query("SELECT 1 FROM walk_reports").get()).toBeNull();
  expect(walkIncidents(f.ports.db, f.trip.propertyId)).toHaveLength(0);
  f.ports.walletProvider.settle = settle;
  await handleReport(f.ports, f.report);
});
test("concurrent duplicate cannot pay twice", async () => {
  const f = await fixture();
  f.cases.tapReception(f.trip.id, f.trip.propertyId, f.user.id);
  const results = await Promise.allSettled([
    handleReport(f.ports, f.report),
    handleReport(f.ports, { ...f.report, id: "other" }),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([
    "fulfilled",
    "rejected",
  ]);
});
test("false report bans same human across user sessions without deleting public incident", async () => {
  const f = await fixture();
  f.cases.tapReception(f.trip.id, f.trip.propertyId, f.user.id);
  await handleReport(f.ports, f.report);
  markWalkFalse(f.ports, f.report.id);
  const saved = f.repo.trips.get(f.trip.id);
  if (!saved) throw new Error("Missing fixture booking");
  saved.trip.id = "bk_other";
  saved.userId = "usr_new";
  f.repo.trips.set(saved.trip.id, saved);
  await expect(
    handleReport(f.ports, {
      ...f.report,
      id: "other",
      bookingId: saved.trip.id,
      userId: saved.userId,
    }),
  ).rejects.toThrow("banned for this World ID");
  expect(walkIncidents(f.ports.db, f.trip.propertyId)[0]?.isFalse).toBe(true);
});
