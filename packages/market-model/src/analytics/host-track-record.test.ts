import { expect, test } from "bun:test";
import { hostTrackRecord } from "./host-track-record";

test("track record retains seeded performance", () => {
  const property = { modelId: "velana", popular: true, base: 300, rooms: 20 };
  expect(hostTrackRecord(property)).toEqual({
    nightsTraded: 210,
    bookedBps: 7456,
    unsoldBps: 1615,
    averageReturnBps: 81,
    profitableBps: 7443,
    refundBps: 4136,
    honouredBps: 9868,
    incidents: 0,
  });
  expect(hostTrackRecord({ ...property, popular: false }).bookedBps).toBe(6856);
});
