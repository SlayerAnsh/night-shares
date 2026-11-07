import { expect, test } from "bun:test";
import { selection } from "../pricing/selection";
import { fixture } from "../test-support/fixture";
import { slippageBound } from "./context";

test("chain selection rejects multiple rooms or nights before reserving anything", () => {
  const f = fixture();
  f.ports.chainExecutor = {
    mode: "chain",
    pending: () => [],
    execute: async () => {
      throw new Error("Unexpected execution");
    },
    recover: async () => {
      throw new Error("Unexpected recovery");
    },
  };
  expect(() => selection(f.ports, f.selection)).toThrow("1 room for 1 night");
  expect(() =>
    selection(f.ports, { ...f.selection, checkOut: "2026-12-05", rooms: 2 }),
  ).toThrow("1 room for 1 night");
  expect(
    selection(f.ports, { ...f.selection, checkOut: "2026-12-05" }).dates,
  ).toEqual(["2026-12-04"]);
  expect(f.repo.locks.size).toBe(0);
  f.ports.db.close();
});

test("booking slippage stays within the locked budget and rounds down", () => {
  expect(slippageBound(1000000n, 2000000n, 50)).toBe(1005000n);
  expect(slippageBound(1000000n, 1000001n, 50)).toBe(1000001n);
  expect(slippageBound(1n, 2n, 50)).toBe(1n);
  expect(slippageBound(1000000n, 2000000n, 0)).toBe(1000000n);
  expect(() => slippageBound(1n, 2n, NaN)).toThrow("BOOKING_SLIPPAGE_BPS");
});
