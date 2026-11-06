import { expect, test } from "bun:test";
import { rng } from "./rng";

test("seeded random streams repeat and advance independently", () => {
  const first = rng(42),
    second = rng(42);
  const sequence = Array.from({ length: 20 }, () => first());
  expect(sequence).toEqual(Array.from({ length: 20 }, () => second()));
  expect(new Set(sequence).size).toBe(20);
  expect(sequence.every((value) => value >= 0 && value < 1)).toBe(true);
});
