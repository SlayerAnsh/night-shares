import { expect, test } from "bun:test";
import {
  addDays,
  countdown,
  isHoliday,
  monthDates,
  rangeDates,
  shiftMonth,
  shortInstant,
  shortNight,
  weekdayMon,
} from "./calendar";

test("month grid covers every night and starts the week on Monday", () => {
  expect(monthDates("2028-02")).toHaveLength(29);
  expect(weekdayMon("2026-12-07")).toBe(0);
  expect(weekdayMon("2026-12-06")).toBe(6);
  expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  expect(shiftMonth("2026-01", -1)).toBe("2025-12");
});

test("night labels and ranges stay in the property calendar", () => {
  expect(shortNight("2026-12-24")).toBe("Thu 24 Dec");
  expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  expect(rangeDates("2026-12-26", "2026-12-24")).toEqual([
    "2026-12-24",
    "2026-12-25",
    "2026-12-26",
  ]);
  expect(isHoliday("2026-12-20")).toBe(true);
  expect(isHoliday("2027-01-03")).toBe(false);
});

test("instants read in UTC and count down to release", () => {
  const at = { seconds: 1798120800n, nanos: 0 };
  expect(shortInstant(at)).toBe("Dec 24, 14:00");
  expect(countdown(at, 1798120800000 - 26 * 36e5)).toBe("in 1 day, 2 hours");
  expect(countdown(at, 1798120800000 + 1)).toBeUndefined();
});
