import { expect, test } from "bun:test";
import { fromTenths, toMicros, toTenths } from "./units";

test("micros round decimal ties away from zero for either sign", () => {
  for (const [value, expected] of [
    [0.0000005, 1n],
    [1.0000005, 1000001n],
    [1.2345674, 1234567n],
    [1.2345675, 1234568n],
    [1e-7, 0n],
    [1e21, 10n ** 27n],
  ] as const) {
    expect(toMicros(value)).toBe(expected);
    expect(toMicros(-value)).toBe(-expected);
  }
  expect(toMicros(-0)).toBe(0n);
  expect(() => toMicros(Infinity)).toThrow(RangeError);
  expect(() => toMicros(NaN)).toThrow(RangeError);
});
test("tenths conversion rounds quantities and restores fractional room nights", () => {
  expect(toTenths(1.25)).toBe(13);
  expect(toTenths(-1.25)).toBe(-13);
  expect(fromTenths(13)).toBe(1.3);
  expect(toTenths(0.1 + 0.2)).toBe(3);
});
