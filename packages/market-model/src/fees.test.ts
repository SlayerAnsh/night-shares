import { expect, test } from "bun:test";
import { askFillProceeds, lateFee } from "./fees";

test("late sell back fee ramps from base at 72 hours to maximum at cutoff", () => {
  expect(lateFee(999)).toBe(0.013);
  expect(lateFee(72)).toBe(0.013);
  expect(lateFee(36)).toBeCloseTo(0.1565, 12);
  expect(lateFee(0)).toBe(0.3);
  expect(lateFee(-24)).toBe(0.3);
});

test("ask sellers receive net proceeds for whole, fractional and zero fills", () => {
  expect(askFillProceeds(200)).toEqual({ gross: 200, fee: 2.6, net: 197.4 });
  expect(askFillProceeds(200, 0.25)).toEqual({
    gross: 50,
    fee: 0.65,
    net: 49.35,
  });
  expect(askFillProceeds(200, 0)).toEqual({ gross: 0, fee: 0, net: 0 });
});
