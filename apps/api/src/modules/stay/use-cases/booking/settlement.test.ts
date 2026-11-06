import { expect, test } from "bun:test";
import { routeBuy, toMicros } from "@night-shares/market-model";
import { settlement } from "./settlement";

for (const src of ["pool", "trader"] as const) {
  test(`booking ${src} fill splits fees and preserves the guest total`, () => {
    const route = routeBuy(
      {
        asks: [
          src === "trader"
            ? { price: 100, size: 1, src, who: "seller" }
            : { price: 100, size: 1, src, guestOnly: false },
        ],
        bids: [],
        recall: 150,
      },
      1,
      { guest: true },
    );
    const payments = settlement(route);
    const paidTo = (to: string) =>
      payments
        .filter((p) => p.to === to)
        .reduce((sum, p) => sum + p.amount, 0n);
    expect(paidTo("cover_fund")).toBe(src === "trader" ? 200000n : 100000n);
    expect(paidTo("treasury")).toBe(src === "trader" ? 2400000n : 1200000n);
    expect(paidTo(src === "trader" ? "seller" : "pool")).toBe(
      src === "trader" ? 98700000n : 100000000n,
    );
    expect(payments.reduce((sum, p) => sum + p.amount, 0n)).toBe(
      toMicros(route.total),
    );
  });
}

test("fractional booking fills reconcile fee rounding without changing total", () => {
  const route = routeBuy(
    {
      asks: [
        { price: 13.123457, size: 0.3, src: "trader", who: "seller" },
        { price: 15.123456, size: 0.7, src: "pool", guestOnly: false },
      ],
      bids: [],
      recall: 20,
    },
    1,
    { guest: true },
  );
  expect(settlement(route).reduce((sum, p) => sum + p.amount, 0n)).toBe(
    toMicros(route.total),
  );
});
