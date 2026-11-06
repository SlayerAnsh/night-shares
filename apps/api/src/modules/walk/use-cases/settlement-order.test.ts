import { expect, test } from "bun:test";
import { mockSubjectFor } from "../../../ports/identity-verifier/identity-verifier.mock";
import { createSqliteHostRepo } from "../../host/repo/host-repo.sqlite";
import { createSweep } from "../../host/use-cases/payout/sweep";
import { adjustCoverAccount, coverAccount } from "../repo/cover-accounts";
import { fixture } from "../testing/fixture";
import { handleReport } from "./handle-report";
import { markWalkFalse } from "./mark-false";

test("sweep and moderation wait for pending walk, then sweep nets the fund advance", async () => {
  const f = await fixture();
  f.cases.tapReception(
    f.trip.id,
    f.cases.issueReceptionTag(f.trip.id, f.user.id).tagPayload,
    f.user.id,
  );
  const repo = createSqliteHostRepo(f.ports);
  const host = {
    id: "host",
    humanId: mockSubjectFor("host"),
    level: "orb" as const,
    walletAddress: await f.ports.walletProvider.linkWallet("host"),
  };
  repo.initialize(host);
  const sweep = createSweep({ ports: f.ports, repo });
  const settle = f.ports.walletProvider.settle;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  f.ports.walletProvider.settle = async (legs) => {
    calls++;
    expect(coverAccount(f.ports.db, f.trip.propertyId).debt).toBe(4000n);
    await gate;
    return settle(legs);
  };
  const reporting = handleReport(f.ports, f.report);
  expect(
    await sweep(host.id, f.trip.propertyId, host.walletAddress),
  ).toBeUndefined();
  expect(() => markWalkFalse(f.ports, f.report.id)).toThrow("in progress");
  expect(calls).toBe(1);
  release();
  await reporting;
  f.ports.walletProvider.settle = settle;
  adjustCoverAccount(f.ports.db, f.trip.propertyId, -10000n, 0n);
  const result = await sweep(host.id, f.trip.propertyId, host.walletAddress);
  expect(result?.debt).toBe(4000n);
  expect(coverAccount(f.ports.db, f.trip.propertyId).debt).toBe(0n);
});
test("walk waits for pending host sweep and market settlement", async () => {
  const f = await fixture();
  f.cases.tapReception(
    f.trip.id,
    f.cases.issueReceptionTag(f.trip.id, f.user.id).tagPayload,
    f.user.id,
  );
  f.ports.db
    .query(
      "INSERT INTO host_sweeps (id, property_id, amount, debt, at, status) VALUES ('sweep', ?, 1, 0, 0, 'pending')",
    )
    .run(f.trip.propertyId);
  await expect(handleReport(f.ports, f.report)).rejects.toThrow(
    "Host payout settlement is in progress",
  );
  f.ports.db.query("DELETE FROM host_sweeps").run();
  f.ports.db
    .query("INSERT INTO market_settlements VALUES ('settling', ?)")
    .run(f.key);
  await expect(handleReport(f.ports, f.report)).rejects.toThrow(
    "Property settlement is in progress",
  );
  expect(f.ports.db.query("SELECT 1 FROM walk_reports").get()).toBeNull();
});
