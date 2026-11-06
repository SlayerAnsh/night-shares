import { expect, test } from "bun:test";
import { routeBuy } from "./route-buy";
import type { Book } from "./types";

const book: Book = {
  asks: [{ price: 200, size: 1, src: "pool", guestOnly: true }],
  bids: [],
  recall: 125,
};
test("traders skip guest inventory while guests recall remaining quantity", () => {
  expect(routeBuy(book, 2).filled).toBe(0);
  const result = routeBuy(book, 2, { guest: true });
  expect(result.filled).toBe(2);
  expect(result.gross).toBe(250);
  expect(result.fills).toEqual([{ price: 125, take: 2, src: "recall" }]);
});
test("guests never pay above the recall cap", () => {
  const result = routeBuy(book, 1, { guest: true });
  expect(result.avg).toBe(125);
  expect(result.fills).toEqual([{ price: 125, take: 1, src: "recall" }]);
});
test("traders may buy above the recall cap and zero orders cost nothing", () => {
  const open: Book = {
    ...book,
    asks: [{ price: 200, size: 1, src: "pool", guestOnly: false }],
  };
  expect(routeBuy(open, 1).avg).toBe(200);
  expect(routeBuy(book, 0).total).toBe(0);
});
