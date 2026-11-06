import { expect, test } from "bun:test";
import { makerRebate } from "./maker-rebate";

test("rebate includes the upper band boundary and cheaper asks", () => {
  expect(makerRebate({ askPrice: 105, poolPrice: 100, size: 2 })).toBe(1.05);
  expect(makerRebate({ askPrice: 90, poolPrice: 100, size: 1 })).toBe(0.45);
  expect(makerRebate({ askPrice: 105.001, poolPrice: 100, size: 1 })).toBe(0);
});
test("rebate caps payment to available funds", () => {
  for (const poolBalance of [-1, 0, 0.1, 1]) {
    expect(
      makerRebate({ askPrice: 100, poolPrice: 100, size: 1, poolBalance }),
    ).toBe(Math.min(0.5, Math.max(0, poolBalance)));
  }
});
