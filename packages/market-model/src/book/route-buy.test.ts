import { expect, test } from "bun:test";
import { routeBuy } from "./route-buy";
import type { Book } from "./types";

const book: Book = {
  asks: [{ price: 200, size: 1, src: "pool" }],
  bids: [],
  recall: 125,
};
test("traders fill available pool inventory while guests recall remaining quantity", () => {
  expect(routeBuy(book, 2).filled).toBe(1);
  const result = routeBuy(book, 2, { guest: true });
  expect(result.filled).toBe(2);
  expect(result.gross).toBe(250);
  expect(result.fills).toEqual([
    { price: 125, take: 2, src: "recall", sellerFee: 3.25, sellerNet: 246.75 },
  ]);
});
test("guests never pay above the recall cap", () => {
  const result = routeBuy(book, 1, { guest: true });
  expect(result.avg).toBe(125);
  expect(result.fills).toEqual([
    {
      price: 125,
      take: 1,
      src: "recall",
      sellerFee: 1.625,
      sellerNet: 123.375,
    },
  ]);
});
test("traders may buy above the recall cap and zero orders cost nothing", () => {
  const open: Book = {
    ...book,
    asks: [{ price: 200, size: 1, src: "pool" }],
  };
  expect(routeBuy(open, 1).avg).toBe(200);
  expect(routeBuy(book, 0).total).toBe(0);
});

test("mixed guest fills charge sellers only for trader and recall inventory", () => {
  const mixed: Book = {
    asks: [
      { price: 80, size: 0.5, src: "pool" },
      { price: 100, size: 0.5, src: "trader", who: "seller" },
    ],
    bids: [],
    recall: 125,
  };
  const before = structuredClone(mixed);
  const result = routeBuy(mixed, 2, { guest: true });
  expect(result.fills[0]).not.toHaveProperty("sellerFee");
  expect(result.fills[0]).not.toHaveProperty("sellerNet");
  expect(result.fills[1]).toMatchObject({ sellerFee: 0.65, sellerNet: 49.35 });
  expect(result.fills[2]).toMatchObject({
    sellerFee: 1.625,
    sellerNet: 123.375,
  });
  expect(result.sellerFees).toBeCloseTo(2.275, 12);
  expect(result.sellerNet).toBeCloseTo(172.725, 12);
  expect(result.gross).toBe(215);
  expect(result.fee).toBeCloseTo(2.795, 12);
  expect(result.total).toBeCloseTo(217.795, 12);
  expect(mixed).toEqual(before);

  const partial = routeBuy(mixed, 0.75);
  expect(partial.fills[1]).toMatchObject({
    take: 0.25,
    sellerFee: 0.325,
    sellerNet: 24.675,
  });
  expect(partial.sellerFees).toBe(0.325);
  expect(partial.sellerNet).toBe(24.675);
});

test("pool fills and empty routes have zero seller totals", () => {
  const pool: Book = {
    ...book,
    asks: [{ price: 100, size: 1, src: "pool" }],
  };
  for (const result of [
    routeBuy(pool, 1),
    routeBuy(pool, 0),
    routeBuy(book, 1),
  ]) {
    expect(result.sellerFees).toBe(0);
    expect(result.sellerNet).toBe(0);
    for (const fill of result.fills) {
      expect(fill).not.toHaveProperty("sellerFee");
      expect(fill).not.toHaveProperty("sellerNet");
    }
  }
});

test("recall uses only holdings remaining after trader ask fills", () => {
  const mixed: Book = {
    asks: [{ price: 100, size: 0.5, src: "trader", who: "seller" }],
    bids: [],
    recall: 125,
  };
  const result = routeBuy(mixed, 2, { guest: true, recallable: 0.7 });
  expect(result.filled).toBeCloseTo(0.7, 12);
  expect(result.fills[1]?.take).toBeCloseTo(0.2, 12);
  expect(routeBuy(mixed, 2, { recallable: 5 }).filled).toBe(0.5);
  expect(routeBuy(mixed, 2, { guest: true, recallable: 0 }).filled).toBe(0.5);
});
