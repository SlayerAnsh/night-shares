import { expect, test } from "bun:test";
import { createSqliteMarketRepo } from "../../market/repo/market-repo.sqlite";
import { releaseAtCutoff } from "../../market/use-cases/release-at-cutoff";
import { nightPending } from "../repo/night-pending";
import { fixture } from "../testing/fixture";
import { handleReport } from "./handle-report";

test("cutoff proceeds pay owed claims, compensate failure and cannot pay twice", async () => {
  const f = await fixture(0n);
  const fund = await f.ports.walletProvider.balance("cover_fund");
  await f.ports.walletProvider.transfer(
    "cover_fund",
    "pool",
    fund,
    "empty fund",
  );
  f.cases.tapReception(
    f.trip.id,
    f.cases.issueReceptionTag(f.trip.id, f.user.id).tagPayload,
    f.user.id,
  );
  await handleReport(f.ports, f.report);
  const next = f.ports.inventory.get(
    `${f.trip.propertyId}:${f.trip.roomTypeId}:2026-12-05`,
  );
  f.clock.set(Date.parse("2026-12-05T15:00:00Z"));
  expect(nightPending(f.ports, next)).toBeGreaterThan(10000n);
  const deps = { ports: f.ports, repo: createSqliteMarketRepo(f.ports.db) };
  const before = await f.ports.walletProvider.balance(f.user.walletAddress);
  const settle = f.ports.walletProvider.settle;
  f.ports.walletProvider.settle = async () => {
    throw new Error("offline");
  };
  await expect(releaseAtCutoff(deps)).rejects.toThrow();
  expect(f.ports.db.query("SELECT owed_paid FROM walk_reports").get()).toEqual({
    owed_paid: 0n,
  });
  expect(f.ports.db.query("SELECT 1 FROM walk_claim_locks").get()).toBeNull();
  f.ports.walletProvider.settle = settle;
  await releaseAtCutoff(deps);
  expect(await f.ports.walletProvider.balance(f.user.walletAddress)).toBe(
    before + 10000n,
  );
  expect(f.repo.trips.get(f.trip.id)?.trip.walk?.owedPaid?.micros).toBe(10000n);
  await releaseAtCutoff(deps);
  expect(await f.ports.walletProvider.balance(f.user.walletAddress)).toBe(
    before + 10000n,
  );
  f.ports.db.close();
});
