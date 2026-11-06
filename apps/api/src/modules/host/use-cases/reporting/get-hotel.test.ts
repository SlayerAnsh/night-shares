import { expect, test } from "bun:test";
import { fixture } from "../fixture";

test("hotel calendar covers selected month and prices cover sixty days", () => {
  const f = fixture(),
    result = f.use.getHotel(f.userId, "prop_velana", "2027-02");
  expect(result.calendar).toHaveLength(56);
  expect(result.monthGlance).toHaveLength(28);
  expect(result.priceSeries).toHaveLength(60);
  expect(result.priceSeries[0]?.date).toBe("2026-12-01");
  expect(() => f.use.getHotel(f.userId, "prop_velana", "2026-13")).toThrow();
});
