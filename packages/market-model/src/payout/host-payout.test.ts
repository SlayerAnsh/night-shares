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

test("settled cutoff refunds reduce host proceeds without retaining trader reserves", () => {
  const state = { F: 100, k: 0.6, S: 10, q: 4, held: 0 };
  const before = hostPayout(state);
  expect(hostPayout({ ...state, cutoffPaid: 80 })).toEqual({
    gross: before.gross - 80,
    availableNow: before.availableNow - 80,
    heldForTraders: 0,
  });
});
