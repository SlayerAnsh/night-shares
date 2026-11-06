import { describe, expect, test } from "bun:test";
import { readSearch, remainingTime, stayHref, validDates } from "./search";

describe("stay URL state", () => {
  test("keeps dates, room and guests through the booking return URL", () => {
    const params = new URLSearchParams(
      "checkIn=2026-12-24&checkOut=2026-12-27&adults=3&kids=1&rooms=2&roomTypeId=rt_ocean",
    );
    const next = stayHref("/stay/prop_velana/checkout", params, {
      book: "",
      destination: "Malé Atoll",
    });
    const result = new URL(next, "https://example.test");
    expect(readSearch(result.searchParams)).toMatchObject({
      checkIn: "2026-12-24",
      checkOut: "2026-12-27",
      adults: 3,
      kids: 1,
      rooms: 2,
      destination: "Malé Atoll",
    });
    expect(result.searchParams.get("roomTypeId")).toBe("rt_ocean");
    expect(result.searchParams.has("book")).toBe(false);
  });
  test("normalizes malformed and out-of-range guest counts", () => {
    expect(
      readSearch(new URLSearchParams("adults=no&kids=-2&rooms=99")),
    ).toMatchObject({ adults: 2, kids: 0, rooms: 8 });
    expect(readSearch(new URLSearchParams("adults=1.5")).adults).toBe(2);
  });
  test("rejects impossible dates and reversed or empty ranges", () => {
    expect(validDates("2026-02-30", "2026-03-03")).toBe(false);
    expect(validDates("2026-12-24", "2026-12-24")).toBe(false);
    expect(validDates("2026-12-25", "2026-12-24")).toBe(false);
    expect(validDates("", "")).toBe(false);
    expect(validDates("2028-02-29", "2028-03-01")).toBe(true);
  });
});
test("lock countdown uses server expiry and never becomes negative", () => {
  expect(remainingTime({ seconds: 1600n, nanos: 0 }, 1000000)).toEqual({
    seconds: 600,
    label: "10:00",
  });
  expect(remainingTime({ seconds: 1600n, nanos: 0 }, 1599500)).toEqual({
    seconds: 1,
    label: "0:01",
  });
  expect(remainingTime({ seconds: 1600n, nanos: 0 }, 1601000)).toEqual({
    seconds: 0,
    label: "0:00",
  });
  expect(remainingTime(undefined, 0).seconds).toBe(0);
});
