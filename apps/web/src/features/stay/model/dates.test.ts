import { describe, expect, test } from "bun:test";
import {
  addNights,
  formatShort,
  localToday,
  monthCells,
  monthStart,
  nightsBetween,
  plural,
} from "./dates";

describe("stay calendar dates", () => {
  test("counts nights across a month end", () => {
    expect(nightsBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(addNights("2026-12-30", 3)).toBe("2027-01-02");
  });

  test("month start moves by whole months", () => {
    expect(monthStart("2026-12-20")).toBe("2026-12-01");
    expect(monthStart("2026-12-20", 1)).toBe("2027-01-01");
  });

  test("month grid starts on Sunday and pads the first week", () => {
    // 1 December 2026 is a Tuesday.
    const cells = monthCells("2026-12-01");
    expect(cells.slice(0, 2)).toEqual([null, null]);
    expect(cells[2]).toBe("2026-12-01");
    expect(cells.at(-1)).toBe("2026-12-31");
  });

  test("labels read like the product", () => {
    expect(formatShort("2026-12-20")).toBe("Dec 20");
    expect(plural(1, "night")).toBe("1 night");
    expect(plural(3, "room")).toBe("3 rooms");
  });
});

test("today follows the guest's local calendar", () => {
  expect(localToday(new Date(2026, 10, 7, 3, 47))).toBe("2026-11-07");
});
