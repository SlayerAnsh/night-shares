import { expect, test } from "bun:test";
import { fixture } from "../fixture";

test("invalid selection fails before changing any selected inventory", () => {
  const f = fixture(),
    before = f.ports.inventory.get(f.key);
  f.selection.dates.push("2026-02-30");
  expect(() => f.use.openNights(f.userId, f.selection)).toThrow();
  expect(f.ports.inventory.get(f.key)).toEqual(before);
  expect(f.ports.activity.list({})).toHaveLength(0);
});
test("host cannot open past dates or disconnected hotels", () => {
  const f = fixture();
  f.selection.dates = ["2026-11-30"];
  expect(() => f.use.previewOpenNights(f.userId, f.selection)).toThrow(
    "240 days",
  );
  f.selection.propertyId = "prop_machiya";
  expect(() => f.use.openNights(f.userId, f.selection)).toThrow("Connect");
});
