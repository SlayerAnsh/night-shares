import { expect, test } from "bun:test";
import { createSystemClock } from "./clock.system";

test("system clock uses real instants and optional UTC date override", () => {
  const before = Date.now();
  const clock = createSystemClock("2026-12-01");
  expect(clock.now()).toBeGreaterThanOrEqual(before);
  expect(clock.now()).toBeLessThanOrEqual(Date.now());
  expect(clock.today()).toBe("2026-12-01");
  expect(createSystemClock().today()).toBe(
    new Date().toISOString().slice(0, 10),
  );
});
