import { afterAll, beforeAll, expect, test } from "bun:test";
import { Code } from "@connectrpc/connect";
import {
  DemandPreset,
  Pms,
  ReleasePolicy,
} from "@night-shares/proto/host/v1/opening_pb";
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

test("Orb host connects, previews, opens, inspects, freezes nights and receives automatic payouts", async () => {
  const { clients, user } = await harness.signInAs("orb", "host");
  const portfolio = await clients.host.getPortfolio({});
  expect(portfolio.hotels).toHaveLength(4);
  expect(portfolio.occupancy).toHaveLength(8);
  const connected = await clients.host.connectChannelManager({
    propertyId: "prop_machiya",
    pms: Pms.MEWS,
  });
  expect(connected.property?.roomTypes).toHaveLength(2);
  expect((await clients.host.getPortfolio({})).hotels).toHaveLength(5);
  const selection = {
    propertyId: "prop_machiya",
    dates: ["2026-12-24"],
    roomTypeIds: ["rt_machiya_0"],
    allotmentPercent: 100,
    demandPreset: DemandPreset.PEAK,
    releasePolicy: ReleasePolicy.THREE_DAYS_BEFORE_12,
  };
  harness.container.ports.inventory.update(
    "prop_machiya:rt_machiya_0:2026-12-24",
    (r) => ({ ...r, openedAt: 0, stopped: true }),
  );
  const preview = await clients.host.previewOpenNights({ selection });
  expect(preview.nights[0]?.floor?.micros).toBeGreaterThan(0n);
  expect(preview.slots).toBe(1);
  expect(preview.kept).toBe(0);
  const opened = await clients.host.openNights({ selection });
  expect(opened.nights[0]?.allotment).toEqual(preview.nights[0]?.allotment);
  const night = await clients.host.getNight({
    propertyId: selection.propertyId,
    date: selection.dates[0],
  });
  expect(night.roomTypes[0]?.allotment).toEqual(opened.nights[0]?.allotment);
  expect(
    night.activity.some((e) =>
      ["nights_opened", "nights_edited"].includes(e.kind),
    ),
  ).toBe(true);
  const hotel = await clients.host.getHotel({
    propertyId: selection.propertyId,
    month: "2026-12",
  });
  expect(hotel.calendar).toHaveLength(62);
  expect(hotel.priceSeries).toHaveLength(60);
  await expect(
    clients.host.openNights({
      selection: { ...selection, allotmentPercent: 50 },
    }),
  ).rejects.toMatchObject({ code: Code.FailedPrecondition });
  const payout = await clients.host.getPayout({
    propertyId: selection.propertyId,
  });
  const available = payout.payout?.availableNow?.micros ?? 0n;
  expect(available).toBeGreaterThan(0n);
  const before = await harness.container.ports.walletProvider.balance(
    user.walletAddress,
  );
  const ports = harness.container.ports;
  const sweep = createSweep({ ports, repo: createSqliteHostRepo(ports) });
  await sweep(user.id, selection.propertyId, user.walletAddress);
  const after = await clients.host.getPayout({
    propertyId: selection.propertyId,
  });
  expect(after.payout?.sweptTotal?.micros).toBe(available);
  expect(after.payout?.lastSweepTransactionId).toBeTruthy();
  expect(await ports.walletProvider.balance(user.walletAddress)).toBe(
    before + available,
  );
});

test("Device user cannot access host RPCs", async () => {
  const { clients } = await harness.signInAs("device", "device-host");
  await expect(clients.host.getPortfolio({})).rejects.toMatchObject({
    code: Code.PermissionDenied,
  });
  await expect(
    clients.host.getPayout({ propertyId: "prop_velana" }),
  ).rejects.toMatchObject({ code: Code.PermissionDenied });
});
