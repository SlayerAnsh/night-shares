import { expect, test } from "bun:test";
import { hostPayout } from "./host-payout";

test("host payout holds trader reserves and funds security bond from booked sales", () => {
  expect(hostPayout({ F: 100, k: 0, S: 10, q: 4, held: 1 })).toEqual({
    gross: 400,
    availableNow: 200,
    heldForTraders: 100,
    bondHeld: 100,
    bondTarget: 100,
  });
  expect(
    hostPayout({ F: 100, k: 0, S: 10, q: 0.5, held: 0 }).availableNow,
  ).toBe(0);
});
