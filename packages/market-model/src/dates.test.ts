import { expect, test } from "bun:test";
import { diffDays, parseDate } from "./dates";

test("calendar day differences cross leap days and DST without clock input", () => {
  expect(diffDays("2024-02-28", "2024-03-01")).toBe(2);
  expect(diffDays("2026-03-07", "2026-03-09")).toBe(2);
  expect(diffDays("2026-03-09", "2026-03-07")).toBe(-2);
  expect(parseDate("2026-12-25").getUTCDate()).toBe(25);
});
