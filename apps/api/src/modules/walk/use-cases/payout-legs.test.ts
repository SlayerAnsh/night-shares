import { expect, test } from "bun:test";
import { payoutLegs } from "./payout-legs";

test("walk refunds the guest once from pending then cover with only cover as debt", () => {
  const payout = payoutLegs(10000n, 6000n, "guest");
  expect(payout.toGuest).toBe(10000n);
  expect(payout.debt).toBe(4000n);
  expect(
    payout.legs.map(({ from, to, amount }) => ({ from, to, amount })),
  ).toEqual([
    { from: "pool", to: "guest", amount: 6000n },
    { from: "cover_fund", to: "guest", amount: 4000n },
  ]);
});
test("pending alone pays without debt and empty pending uses fund only", () => {
  expect(payoutLegs(100n, 500n, "guest").debt).toBe(0n);
  expect(payoutLegs(100n, 500n, "guest").legs).toHaveLength(1);
  expect(payoutLegs(100n, 0n, "guest").fromFund).toBe(100n);
});
test("large micros stay exact and negative amounts reject", () => {
  expect(payoutLegs(9007199254740993n, 0n, "guest").toGuest).toBe(
    9007199254740993n,
  );
  expect(() => payoutLegs(-1n, 0n, "guest")).toThrow(RangeError);
});

test("empty cover fund leaves an unpaid guest claim", () => {
  const payout = payoutLegs(10000n, 6000n, "guest", 0n);
  expect(payout.fromFund).toBe(0n);
  expect(payout.owedToGuest).toBe(4000n);
  expect(payout.legs.reduce((sum, leg) => sum + leg.amount, 0n)).toBe(6000n);
});
