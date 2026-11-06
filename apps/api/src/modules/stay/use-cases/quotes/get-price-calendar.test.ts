import { expect, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import { GetPriceCalendarRequestSchema } from "@night-shares/proto/stay/v1/stay_pb";
import { fixture } from "../../test-support/fixture";

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
