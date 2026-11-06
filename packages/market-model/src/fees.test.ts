import { expect, test } from "bun:test";
import { lateFee } from "./fees";

test("late sell back fee ramps from base at 72 hours to maximum at cutoff", () => {
  expect(lateFee(999)).toBe(0.013);
  expect(lateFee(72)).toBe(0.013);
  expect(lateFee(36)).toBeCloseTo(0.1565, 12);
  expect(lateFee(0)).toBe(0.3);
  expect(lateFee(-24)).toBe(0.3);
});
