import { expect, test } from "bun:test";
import { openDatabase } from "../db/open-database";
import { createReadiness } from "./readiness";

test("readiness requires reachable database and every migration", () => {
  const db = openDatabase(":memory:");
  const ready = createReadiness(db);
  expect(ready()).toBe(true);
  db.exec("DELETE FROM schema_migrations WHERE version = 1");
  expect(ready()).toBe(false);
  db.close();
  expect(ready()).toBe(false);
});

test("readyz returns 503 and reason for ops gas shortage; healthz stays live", async () => {
  const { buildContainer } = await import("../container/build-container");
  const { createHarness } = await import("../../test/e2e/harness");
  const { createGasFloat } = await import("../ports/wallet-custody/gas-float");
  const container = buildContainer({
    port: 0,
    adapters: "mock",
    dbPath: ":memory:",
  });
  let balance = 0n;
  if (!container.ports.chainExecutor) throw new Error("Missing executor");
  const gas = createGasFloat({
    db: container.ports.db,
    fingerprint: "test",
    opsAddress: `0x${"11".repeat(20)}`,
    policy: { float: 50n, lowWater: 10n, dailyCap: 200n, opsMinBalance: 100n },
    getBalance: async () => balance,
    executor: container.ports.chainExecutor,
  });
  container.ports.chainReadiness = gas.readiness;
  const harness = await createHarness(container);
  try {
    const response = await fetch(`${harness.baseUrl}/readyz`);
    expect(response.status).toBe(503);
    expect((await response.json()).reason).toContain("CHAIN_OPS_MIN_BALANCE");
    expect((await fetch(`${harness.baseUrl}/healthz`)).status).toBe(200);
    balance = 100n;
    expect((await fetch(`${harness.baseUrl}/readyz`)).status).toBe(200);
  } finally {
    await harness.close();
  }
});
