import { expect, test } from "bun:test";
import { fixture } from "../fixture";

test("demo host sees four connected hotels and eight occupancy weeks", () => {
  const f = fixture(),
    result = f.use.getPortfolio(f.userId);
  expect(result.hotels.map((h) => h.propertyId)).toEqual([
    "prop_velana",
    "prop_ubud",
    "prop_rive",
    "prop_alpen",
  ]);
  expect(result.occupancy).toHaveLength(8);
  expect(result.kpis.availableNow.micros).toBeGreaterThan(0n);
  expect(result.kpis.revenue.micros).toBe(
    result.hotels.reduce((n, h) => n + h.kpis.revenue.micros, 0n),
  );
});
