import { expect, test } from "bun:test";
import { slippageBounds } from "./runtime";

test("default 50 bps uses exact bounded integer rounding", () => {
  expect(slippageBounds(1000000n)).toEqual({ max: 1005000n, min: 995000n });
  expect(slippageBounds(1n)).toEqual({ max: 2n, min: 0n });
  expect(slippageBounds(1234567890123456789n, 0)).toEqual({
    max: 1234567890123456789n,
    min: 1234567890123456789n,
  });
  expect(slippageBounds(10000n, 123)).toEqual({ max: 10123n, min: 9877n });
  for (const bps of [-1, 10001, 1.5, NaN])
    expect(() => slippageBounds(1n, bps)).toThrow("Slippage");
});
