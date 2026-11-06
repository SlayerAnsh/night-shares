import { expect, test } from "bun:test";
import { payoutLegs } from "./payout-legs";

test("walk pays the guest twice from pending then cover with only cover as debt", () => {
  const payout = payoutLegs(10000n, 12000n, "guest");
  expect(payout.toGuest).toBe(20000n);
  expect(payout.debt).toBe(8000n);
  expect(
    payout.legs.map(({ from, to, amount }) => ({ from, to, amount })),
  ).toEqual([
    { from: "pool", to: "guest", amount: 12000n },
    { from: "cover_fund", to: "guest", amount: 8000n },
  ]);
});
test("pending alone pays without debt and empty pending uses fund only", () => {
  expect(payoutLegs(100n, 500n, "guest").debt).toBe(0n);
  expect(payoutLegs(100n, 500n, "guest").legs).toHaveLength(1);
  expect(payoutLegs(100n, 0n, "guest").fromFund).toBe(200n);
});
test("unsafe and negative paid amounts reject before conversion", () => {
  expect(() =>
    payoutLegs(BigInt(Number.MAX_SAFE_INTEGER), 0n, "guest"),
  ).toThrow(RangeError);
  expect(() => payoutLegs(-1n, 0n, "guest")).toThrow(RangeError);
});
