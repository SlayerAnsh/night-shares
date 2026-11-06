import { afterAll, beforeAll, expect, test } from "bun:test";
import { Code, ConnectError } from "@connectrpc/connect";
import { createSqliteHostRepo } from "../../src/modules/host/repo/host-repo.sqlite";
import { createSweep } from "../../src/modules/host/use-cases/payout/sweep";
import { createHarness } from "./harness";

let harness: Awaited<ReturnType<typeof createHarness>>;
beforeAll(async () => {
  harness = await createHarness();
});
afterAll(async () => {
  await harness?.close();
});

test("Orb non-owner cannot read, open or connect demo hotels", async () => {
  const { clients } = await harness.signInAs("orb", "intruder");
  expect((await clients.host.getPortfolio({})).hotels).toHaveLength(0);
  const propertyId = "prop_velana";
  const forbidden = [
    clients.host.getHotel({ propertyId }),
    clients.host.getNight({ propertyId, date: "2026-12-24" }),
    clients.host.getPayout({ propertyId }),
    clients.host.previewOpenNights({ selection: { propertyId } }),
    clients.host.openNights({ selection: { propertyId } }),
    clients.host.connectChannelManager({ propertyId, pms: 1 }),
  ];
  const codes = await Promise.all(
    forbidden.map((call) =>
      call.then(
        () => "ok",
        (error: unknown) => ConnectError.from(error).code,
      ),
    ),
  );
  expect(codes).toEqual(forbidden.map(() => Code.PermissionDenied));
});

test("concurrent sweeps pay owner once", async () => {
  const { clients, user } = await harness.signInAs("orb", "host");
  const propertyId = "prop_ubud";
  const available =
    (await clients.host.getPayout({ propertyId })).payout?.availableNow
      ?.micros ?? 0n;
  expect(available).toBeGreaterThan(0n);
  const ports = harness.container.ports;
  const before = await ports.walletProvider.balance(user.walletAddress);
  const sweep = createSweep({ ports, repo: createSqliteHostRepo(ports) });
  const results = await Promise.all([
    sweep(user.id, propertyId, user.walletAddress),
    sweep(user.id, propertyId, user.walletAddress),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(
    results.reduce((sum, result) => sum + (result?.amount ?? 0n), 0n),
  ).toBe(available);
  expect(await ports.walletProvider.balance(user.walletAddress)).toBe(
    before + available,
  );
});

test("parallel market requests cannot buy twice with funds for one", async () => {
  const { clients, user } = await harness.signInAs("orb", "concurrent-buyer");
  const night = {
    propertyId: "prop_velana",
    roomTypeId: "rt_velana_0",
    date: "2026-12-10",
  };
  const key = `${night.propertyId}:${night.roomTypeId}:${night.date}`;
  const { inventory, walletProvider: wallet } = harness.container.ports;
  inventory.update(key, (r) => ({
    ...r,
    state: { ...r.state, traderAsks: [] },
  }));
  const before = inventory.get(key);
  const cost =
    (await clients.market.quoteBuy({ night, size: { tenths: 1 } })).quote?.total
      ?.micros ?? 0n;
  await wallet.transfer(
    user.walletAddress,
    "pool",
    (await wallet.balance(user.walletAddress)) - cost,
    "test funding",
  );
  const request = {
    night,
    size: { tenths: 1 },
    maxTotal: { micros: 10n ** 12n },
  };
  const results = await Promise.all([
    clients.market.buy(request).then(
      () => true,
      () => false,
    ),
    clients.market.buy(request).then(
      () => true,
      () => false,
    ),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(inventory.get(key).state.q).toBeCloseTo(before.state.q + 0.1);
  expect(
    (await clients.market.getPortfolio({})).holdings[0]?.size?.tenths,
  ).toBe(1);
  expect(await wallet.balance(user.walletAddress)).toBe(0n);
});
