import { expect, test } from "bun:test";
import { book } from "./build-book";

test("book sorts trader asks and exposes every pool slice to everyone", () => {
  const result = book({
    F: 100,
    k: 0,
    S: 2,
    q: 1,
    traderAsks: [{ price: 50, size: 0.5, who: "seller" }],
    levels: 2,
    hoursLeft: 0,
  });
  expect(result.asks[0]).toEqual({
    price: 50,
    size: 0.5,
    src: "trader",
    who: "seller",
  });
  for (const ask of result.asks) expect(ask).not.toHaveProperty("guestOnly");
  expect(result.bids).toHaveLength(2);
  expect(result.bids[0]?.net).toBeCloseTo(70, 10);
  expect(result.recall).toBe(125);
});
test("empty pool endpoints do not generate slices beyond inventory", () => {
  expect(book({ F: 100, k: 0, S: 1, q: 1 }).asks).toEqual([]);
  expect(book({ F: 100, k: 0, S: 1, q: 0 }).bids).toEqual([]);
});
