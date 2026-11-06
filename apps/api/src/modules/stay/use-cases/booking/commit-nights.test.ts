import { expect, test } from "bun:test";
import { routeNight } from "../../pricing/quote-night";
import { fixture } from "../../test-support/fixture";
import { commitNights } from "./commit-nights";

test("night commit appends booking activity alongside inventory changes", () => {
  const f = fixture();
  const record = f.ports.inventory.get(f.key);
  commitNights(
    f.ports,
    [{ key: f.key, route: routeNight(record, 1) }],
    1,
    record.propertyId,
    "guest",
  ).publish();
  expect(f.ports.inventory.get(f.key).state.booked).toBe(
    record.state.booked + 1,
  );
  expect(f.ports.activity.list({ kinds: ["guest_booked"] })).toHaveLength(1);
});
