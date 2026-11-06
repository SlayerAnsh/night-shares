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
  expect(result.gross).toBe(325);
  expect(result.fills[1]).toEqual({ price: 125, take: 1, src: "recall" });
});
test("routing preserves original above recall asks and zero order behavior", () => {
  expect(routeBuy(book, 1, { guest: true }).avg).toBe(200);
  expect(routeBuy(book, 0).total).toBe(0);
});
