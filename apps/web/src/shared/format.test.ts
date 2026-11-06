import { expect, test } from "bun:test";
import { formatNight, formatRoomNights, formatUsdc } from "./format";

test("formats USDC without losing bigint precision", () => {
  expect(formatUsdc(12480000000n)).toBe("12,480.00 USDC");
  expect(formatUsdc(999999999999999999999999n)).toBe(
    "1,000,000,000,000,000,000.00 USDC",
  );
  expect(formatUsdc(-1234567n)).toBe("-1.23 USDC");
  expect(formatUsdc(1995000n)).toBe("2.00 USDC");
  expect(formatUsdc(-1n)).toBe("0.00 USDC");
  expect(formatUsdc(1234567n, { decimals: 6, suffix: false })).toBe("1.234567");
  expect(formatUsdc(12500000n, { decimals: 0 })).toBe("13 USDC");
});
test("formats integer tenths", () => {
  expect(formatRoomNights(1)).toBe("0.1");
  expect(formatRoomNights(10)).toBe("1");
  expect(formatRoomNights(124805)).toBe("12,480.5");
  expect(() => formatRoomNights(1.5)).toThrow(RangeError);
});
test("formats property calendar dates without timezone shifts", () => {
  expect(formatNight("2026-12-24")).toBe("Dec 24, 2026");
  expect(formatNight("2024-02-29")).toBe("Feb 29, 2024");
  for (const invalid of ["2026-02-29", "2026-13-01", "12/24/2026"])
    expect(() => formatNight(invalid)).toThrow(RangeError);
});
