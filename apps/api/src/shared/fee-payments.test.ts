import { expect, test } from "bun:test";
import { feePayments } from "./fee-payments";

test("fund rounds to micros while treasury receives the exact remainder", () => {
  expect(feePayments(1500n, 20n)).toEqual([
    { to: "cover_fund", amount: 2n },
    { to: "treasury", amount: 18n },
  ]);
  expect(feePayments(1n, 0n)).toEqual([
    { to: "cover_fund", amount: 0n },
    { to: "treasury", amount: 0n },
  ]);
});

test("late sell-back fees still contribute only 0.1 percent of notional", () => {
  expect(feePayments(100000000n, 30000000n, true)).toEqual([
    { to: "cover_fund", amount: 100000n },
    { to: "treasury", amount: 1200000n },
    { to: "rebate_pool", amount: 28700000n },
  ]);
});

test("a leg without a fee pays nothing to either fund", () => {
  expect(feePayments(1_000_000_000n, 0n).map((p) => p.amount)).toEqual([
    0n,
    0n,
  ]);
});
