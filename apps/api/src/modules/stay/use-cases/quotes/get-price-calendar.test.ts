import { expect, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import { FEE, recallStrike, toMicros } from "@night-shares/market-model";
import { GetPriceCalendarRequestSchema } from "@night-shares/proto/stay/v1/stay_pb";
import { PriceSource } from "@night-shares/proto/stay/v1/trip_pb";
import { bookingFixture, fixture } from "../../test-support/fixture";

test("calendar prices one room for every night with exclusive end", () => {
  const f = fixture();
  const nights = f.cases.getPriceCalendar(
    create(GetPriceCalendarRequestSchema, {
      propertyId: f.selection.propertyId,
      roomTypeId: f.selection.roomTypeId,
      startDate: f.selection.checkIn,
      endDate: f.selection.checkOut,
    }),
  );
  expect(nights.map((n) => n.date)).toEqual(["2026-12-04", "2026-12-05"]);
  expect(nights[0]?.price.micros).toBe(
    f.cases.quoteStay(f.selection).nights[0]?.price?.micros,
  );
});

for (const unavailable of [
  "sold out",
  "stopped",
  "partial",
  "closed",
] as const) {
  test(`calendar retains every night when one night is ${unavailable}`, async () => {
    const f = await bookingFixture();
    try {
      const request = create(GetPriceCalendarRequestSchema, {
        propertyId: f.selection.propertyId,
        roomTypeId: f.selection.roomTypeId,
        startDate: f.selection.checkIn,
        endDate: f.selection.checkOut,
      });
      const before = f.cases.getPriceCalendar(request);
      const record = f.ports.inventory.update(f.key, (r) => ({
        ...r,
        stopped: unavailable === "stopped",
        released: unavailable === "closed",
        state: {
          ...r.state,
          ...(unavailable === "sold out"
            ? { booked: r.state.S, q: r.state.S, held: 0 }
            : unavailable === "partial"
              ? { booked: 0, q: r.state.S, held: 0.5 }
              : {}),
        },
      }));
      const nights = f.cases.getPriceCalendar(request);
      expect(nights.map((n) => n.date)).toEqual(["2026-12-04", "2026-12-05"]);
      expect(nights[0]?.isSoldOut).toBe(true);
      expect(nights[0]?.source).toBe(PriceSource.RECALL_CAP);
      expect(nights[0]?.price.micros).toBe(
        toMicros(recallStrike(record.state.F, record.state.k) * (1 + FEE)),
      );
      expect(nights[1]).toEqual(before[1]);
      expect(nights[1]?.isSoldOut).toBe(false);
      expect(nights[1]?.price.micros).toBeGreaterThan(0n);
      if (unavailable !== "closed")
        expect(() => f.cases.quoteStay(f.selection)).toThrow(
          "This night is sold out.",
        );
      await expect(
        f.cases.createBooking(f.request, f.user),
      ).rejects.toMatchObject({
        code: "FAILED_PRECONDITION",
        message:
          unavailable === "closed"
            ? "This night has closed."
            : "This night is sold out.",
      });
    } finally {
      f.ports.db.close();
    }
  });
}

test("unavailable calendar night uses zero when recall price cannot be computed", () => {
  const f = fixture();
  try {
    f.ports.inventory.update(f.key, (r) => ({
      ...r,
      stopped: true,
      state: { ...r.state, k: 1000 },
    }));
    const nights = f.cases.getPriceCalendar(
      create(GetPriceCalendarRequestSchema, {
        propertyId: f.selection.propertyId,
        roomTypeId: f.selection.roomTypeId,
        startDate: f.selection.checkIn,
        endDate: f.selection.checkOut,
      }),
    );
    expect(nights[0]).toMatchObject({
      isSoldOut: true,
      price: { micros: 0n },
      source: PriceSource.HOTEL,
    });
    expect(nights[1]?.isSoldOut).toBe(false);
  } finally {
    f.ports.db.close();
  }
});

test("calendar preserves invalid selection errors", () => {
  const f = fixture();
  try {
    const request = create(GetPriceCalendarRequestSchema, {
      propertyId: f.selection.propertyId,
      roomTypeId: "rt_missing",
      startDate: f.selection.checkIn,
      endDate: f.selection.checkOut,
    });
    expect(() => f.cases.getPriceCalendar(request)).toThrow();
    expect(() =>
      f.cases.getPriceCalendar({ ...request, endDate: request.startDate }),
    ).toThrow("Choose 1 to 365 nights.");
  } finally {
    f.ports.db.close();
  }
});
