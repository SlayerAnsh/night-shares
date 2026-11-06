import { expect, test } from "bun:test";
import { hostPayout } from "./host-payout";

test("host payout holds only trader reserves", () => {
  expect(hostPayout({ F: 100, k: 0, S: 10, q: 4, held: 1 })).toEqual({
    gross: 400,
    availableNow: 300,
    heldForTraders: 100,
  });
  expect(
    hostPayout({ F: 100, k: 0, S: 10, q: 0.5, held: 0 }).availableNow,
  ).toBe(50);
});
