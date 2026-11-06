import { expect, test } from "bun:test";
import { fixture } from "../fixture";

test("host edits allotment without losing asks or booked and held rooms", () => {
  const f = fixture(),
    before = f.ports.inventory.get(f.key);
  f.selection.allotmentPercent = 10;
  const nights = f.use.openNights(f.userId, f.selection);
  const after = f.ports.inventory.get(f.key);
  expect(after.state.S).toBeGreaterThanOrEqual(
    after.state.booked + after.state.held,
  );
  expect(after.state.booked).toBe(before.state.booked);
  expect(after.state.traderAsks).toEqual(before.state.traderAsks);
  expect(nights[0]?.releasePolicy).toBe(f.selection.releasePolicy);
  expect(f.ports.activity.list({ nightKey: f.key })[0]?.kind).toBe(
    "nights_edited",
  );
});
test("opening stopped nights clears stopped and records opening time", () => {
  const f = fixture();
  f.ports.inventory.update(f.key, (r) => ({ ...r, stopped: true }));
  f.use.openNights(f.userId, f.selection);
  expect(f.ports.inventory.get(f.key).stopped).toBe(false);
  expect(f.ports.activity.list({ nightKey: f.key })[0]?.kind).toBe(
    "nights_opened",
  );
});
