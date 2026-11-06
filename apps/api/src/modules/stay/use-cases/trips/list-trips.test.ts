import { expect, test } from "bun:test";
import { tripFixture } from "../../test-support/fixture";

test("trips stay private and move to past after checkout", () => {
  const f = tripFixture();
  expect(f.cases.listTrips("other").upcoming).toHaveLength(0);
  expect(f.cases.listTrips("guest").upcoming).toHaveLength(1);
  f.ports.clock = { now: () => 0, today: () => "2026-12-07" };
  expect(f.cases.listTrips("guest").past).toHaveLength(1);
});
