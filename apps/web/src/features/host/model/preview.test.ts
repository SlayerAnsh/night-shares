import { expect, test } from "bun:test";
import type { OpenNightPreview } from "@night-shares/proto/host/v1/opening_pb";
import { previewByRoomType } from "./preview";

const usdc = (micros: bigint) => ({
  $typeName: "night_shares.common.v1.Usdc" as const,
  micros,
});

function preview(date: string, floor: bigint): OpenNightPreview {
  return {
    $typeName: "night_shares.host.v1.OpenNightPreview",
    night: {
      $typeName: "night_shares.common.v1.NightKey",
      propertyId: "prop_test",
      roomTypeId: "rt_test",
      date,
    },
    allotment: { $typeName: "night_shares.common.v1.RoomNights", tenths: 30 },
    floor: usdc(floor),
    lastRoomPrice: usdc(floor * 2n),
    guestPriceCap: usdc(floor * 3n),
    minimumPayout: usdc(floor * 10n),
  };
}

test("preview averages prices and sums payout per room type", () => {
  const [row] = previewByRoomType([
    preview("2026-12-24", 100n),
    preview("2026-12-25", 200n),
  ]);
  expect(row?.nights).toBe(2);
  expect(row?.allotment).toBe(60);
  expect(row?.floor).toBe(150n);
  expect(row?.cap).toBe(450n);
  expect(row?.minimumPayout).toBe(3000n);
});
