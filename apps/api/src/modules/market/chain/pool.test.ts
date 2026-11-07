import { expect, test } from "bun:test";
import { ladderQuote } from "./pool";

test("position quotes integrate actual liquidity in both directions and stop at exhaustion", () => {
  const ranges = [
    { lo: 1, hi: 2, liquidity: 2 },
    { lo: 2, hi: 4, liquidity: 2 },
  ];
  expect(ladderQuote(ranges, 1, 1, true)).toBeCloseTo(2);
  expect(ladderQuote(ranges, 1, 1.5, true)).toBeCloseTo(6);
  expect(ladderQuote(ranges, 4, 1.5, false)).toBeCloseTo(6);
  expect(ladderQuote(ranges, 1, 1.6, true)).toBeUndefined();
  expect(
    ladderQuote([{ lo: 1, hi: 2, liquidity: 0 }], 1, 0.1, true),
  ).toBeUndefined();
});
