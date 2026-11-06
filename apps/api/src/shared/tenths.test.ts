import { expect, test } from "bun:test";
import { toWholeTenths } from "./tenths";

test("whole tenths accept drift but reject fractional and unsafe quantities", () => {
  expect(toWholeTenths(0.1 + 0.2)).toBe(3);
  expect(toWholeTenths(0.3 - 0.2)).toBe(1);
  expect(toWholeTenths(-0.3)).toBe(-3);
  for (const size of [0.15, 0.300000001, Number.NaN, Infinity, 1e16])
    expect(() => toWholeTenths(size)).toThrow();
});
