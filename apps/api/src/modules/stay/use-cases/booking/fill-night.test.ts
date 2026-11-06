import { expect, test } from "bun:test";
import { routeNight } from "../../pricing/quote-night";
import { fixture } from "../../test-support/fixture";
import { fillNight } from "./fill-night";

test("guest fills preserve booked plus held equals pool position", () => {
  const f = fixture();
  const record = f.ports.inventory.get(f.key);
  const next = fillNight(record, routeNight(record, 1), 1);
  expect(next.state.booked).toBe(record.state.booked + 1);
  expect(next.state.booked + next.state.held).toBeCloseTo(next.state.q);
});
