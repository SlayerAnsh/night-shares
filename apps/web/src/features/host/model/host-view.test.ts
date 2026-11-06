import { describe, expect, test } from "bun:test";
import type { HostNight, Payout } from "@night-shares/proto/host/v1/hotel_pb";
import {
  aggregateDays,
  datesBetween,
  nextBusy,
  parseAmount,
  sumPayouts,
} from "./host-view";

function night(date: string, booked: number, held: number): HostNight {
  return {
    $typeName: "night_shares.host.v1.HostNight",
    night: {
      $typeName: "night_shares.common.v1.NightKey",
      propertyId: "prop_test",
      roomTypeId: "rt_test",
      date,
    },
    allotment: { $typeName: "night_shares.common.v1.RoomNights", tenths: 100 },
    booked: { $typeName: "night_shares.common.v1.RoomNights", tenths: booked },
    held: { $typeName: "night_shares.common.v1.RoomNights", tenths: held },
    onSale: {
      $typeName: "night_shares.common.v1.RoomNights",
      tenths: 100 - booked - held,
    },
    demandPreset: 2,
    releasePolicy: 1,
    isStopped: false,
  };
}

describe("host selections", () => {
  test("date ranges exclude checkout and cross leap day", () => {
    expect(datesBetween("2028-02-28", "2028-03-02")).toEqual([
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
  });
  test("invalid and excessive date ranges cannot open nights", () => {
    for (const [start, end] of [
      ["", "2026-12-10"],
      ["2026-02-30", "2026-03-04"],
      ["2026-12-10", "2026-12-10"],
      ["2026-12-10", "2026-12-09"],
      ["2026-01-01", "2027-01-01"],
    ]) {
      expect(datesBetween(start ?? "", end ?? "")).toEqual([]);
    }
  });
  test("withdrawals preserve exact micros above floating point precision", () => {
    expect(parseAmount("9007199254740993.000001")).toBe(
      9007199254740993000001n,
    );
    expect(parseAmount("0.000001")).toBe(1n);
    for (const value of ["0", "-1", "1e3", "1.0000001", "1,000", "NaN", ""])
      expect(parseAmount(value)).toBeUndefined();
  });
});

describe("host reporting", () => {
  test("calendar combines room types without rounding fractional rooms", () => {
    expect(
      aggregateDays([
        night("2026-12-24", 11, 29),
        night("2026-12-24", 19, 41),
      ])[0],
    ).toEqual({
      date: "2026-12-24",
      allotment: 200,
      booked: 30,
      held: 70,
      onSale: 100,
    });
  });
  test("next busy includes held rooms and excludes past nights", () => {
    expect(
      nextBusy(
        [
          night("2026-12-23", 90, 0),
          night("2026-12-25", 50, 30),
          night("2026-12-24", 70, 9),
        ],
        "2026-12-24",
      ),
    ).toBe("2026-12-25");
    expect(nextBusy([], "2026-12-24")).toBeUndefined();
  });
  test("payout totals keep fees separate from available funds", () => {
    const rows: Payout[] = [1n, 2n].map((amount) => ({
      $typeName: "night_shares.host.v1.Payout",
      availableNow: {
        $typeName: "night_shares.common.v1.Usdc",
        micros: amount,
      },
      fees: { $typeName: "night_shares.common.v1.Usdc", micros: 100n },
    }));
    expect(sumPayouts(rows).availableNow.micros).toBe(3n);
    expect(sumPayouts(rows).fees.micros).toBe(200n);
    expect(sumPayouts([]).securityHold.micros).toBe(0n);
  });
});
