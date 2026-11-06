import { describe, expect, test } from "bun:test";
import type { GetBookResponse } from "@night-shares/proto/market/v1/market_pb";
import { bookRows } from "./book-rows";

const level = (dollars: number, tenths: number) => ({
  price: { micros: BigInt(dollars) * 1_000_000n },
  size: { tenths },
  source: 1,
  askId: `a${dollars}`,
});

const book = {
  asks: [level(110, 5), level(120, 5)],
  bids: [level(100, 10)],
  fairPrice: { micros: 108_000_000n },
  recallCap: { micros: 150_000_000n },
  holders: [],
  lateFeeBps: 0,
} as unknown as GetBookResponse;

describe("order book ladder", () => {
  test("asks run high to low above the spread, bids below", () => {
    const kinds = bookRows(book).map((row) => row.kind);
    expect(kinds).toEqual(["recall", "ask", "ask", "fair", "spread", "bid"]);
  });
  test("depth is cumulative size against the deepest side", () => {
    const rows = bookRows(book);
    const asks = rows.filter((row) => row.kind === "ask");
    expect(asks.map((row) => ("depth" in row ? row.depth : 0))).toEqual([
      1, 0.5,
    ]);
    const spread = rows.find((row) => row.kind === "spread");
    expect(spread && "spread" in spread ? spread.spread : null).toBe(
      10_000_000n,
    );
  });
});
