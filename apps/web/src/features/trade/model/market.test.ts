import { describe, expect, test } from "bun:test";
import {
  daysOut,
  nightHref,
  parseMicros,
  parseNightKey,
  parseTenths,
} from "./market";

describe("trade input and navigation", () => {
  test("money preserves micro precision beyond floating point integers", () => {
    expect(parseMicros("9007199254.740993")).toBe(9007199254740993n);
    expect(parseMicros("0.000001")).toBe(1n);
    for (const value of ["", "-1", "0", "1e3", "1.0000001", "9223372036855"])
      expect(parseMicros(value)).toBeNull();
  });
  test("sizes accept only positive integer tenths", () => {
    expect(parseTenths("0.1")).toBe(1);
    expect(parseTenths("12.3")).toBe(123);
    for (const value of ["0", "-1", "0.11", "NaN", "Infinity", "214748364.8"])
      expect(parseTenths(value)).toBeNull();
  });
  test("night routes preserve identifiers and reject impossible dates", () => {
    const key = "prop_a:rt_b:2028-02-29";
    const night = parseNightKey(key);
    expect(night).not.toBeNull();
    if (night)
      expect(nightHref(night)).toBe(`/trade/${encodeURIComponent(key)}`);
    expect(parseNightKey("prop_a:rt_b:2027-02-29")).toBeNull();
    expect(parseNightKey(`${key}:extra`)).toBeNull();
  });
  test("days out uses supplied time", () => {
    expect(daysOut("2026-11-09", Date.parse("2026-11-07T12:00:00Z"))).toBe(2);
  });
});
