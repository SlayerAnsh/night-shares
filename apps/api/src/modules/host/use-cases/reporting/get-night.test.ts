import { expect, test } from "bun:test";
import { fixture } from "../fixture";

test("night shows real shared activity and selected release cutoff", () => {
  const f = fixture();
  f.use.openNights(f.userId, f.selection);
  const result = f.use.getNight(f.userId, "prop_velana", "2026-12-24");
  expect(result.roomTypes).toHaveLength(2);
  expect(result.activity[0]?.kind).toBe("nights_edited");
  expect(result.roomTypes[0]?.releaseAt.seconds).toBe(
    BigInt(Date.parse("2026-12-23T18:00:00Z") / 1000),
  );
  expect(
    result.releaseTimeline.some(
      (e) => e.description === "Guests check out; security hold returns",
    ),
  ).toBe(true);
});
