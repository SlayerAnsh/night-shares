import { expect, test } from "bun:test";
import { cutoffRefund } from "./cutoff-refund";

test("cutoff redeems held nights at their average pool bid less thirty percent", () => {
  const result = cutoffRefund({ F: 6000, k: 1.2, S: 15, q: 6, held: 4 });
  expect(result.avgBid).toBeCloseTo(8298.07, 2);
  expect(result.perNight).toBeCloseTo(5808.65, 2);
  expect(result.total).toBeCloseTo(23234.59, 2);
  expect(result.haircut).toBeCloseTo(9957.68, 2);
});

test("empty and negligible holdings receive zero cutoff refund", () => {
  for (const held of [-1, 0, 1e-10, 1e-9]) {
    expect(cutoffRefund({ F: 6000, k: 1.2, S: 15, q: 6, held })).toEqual({
      avgBid: 0,
      perNight: 0,
      total: 0,
      haircut: 0,
    });
  }
});

test("fully held inventory shares the entire reserve at cutoff", () => {
  expect(cutoffRefund({ F: 100, k: 0, S: 15, q: 6, held: 6 })).toEqual({
    avgBid: 100,
    perNight: 70,
    total: 420,
    haircut: 180,
  });
});
