import type { BookLevel } from "@night-shares/proto/market/v1/book_pb";
import type { GetBookResponse } from "@night-shares/proto/market/v1/market_pb";

export type BookRow =
  | { kind: "ask" | "bid"; level: BookLevel; cumulative: number; depth: number }
  | { kind: "spread"; price: bigint; spread?: bigint }
  | { kind: "fair"; price: bigint }
  | { kind: "recall"; price: bigint };

const DEPTH = 8;

// One ladder from the book: asks high to low, the spread, then bids, with the
// fair price and the guest recall cap slotted in at their price.
export function bookRows(book: GetBookResponse): BookRow[] {
  const asks = book.asks.slice(0, DEPTH);
  const bids = book.bids.slice(0, DEPTH);
  const cum = (levels: BookLevel[]) => {
    let total = 0;
    return levels.map((level) => {
      total += level.size?.tenths ?? 0;
      return total;
    });
  };
  const askCum = cum(asks);
  const bidCum = cum(bids);
  const deepest = Math.max(askCum.at(-1) ?? 0, bidCum.at(-1) ?? 0, 1);
  const rows: BookRow[] = asks
    .map((level, i): BookRow => {
      const cumulative = askCum[i] ?? 0;
      return { kind: "ask", level, cumulative, depth: cumulative / deepest };
    })
    .reverse();
  const bestAsk = asks[0]?.price?.micros;
  const bestBid = bids[0]?.price?.micros;
  const mid =
    bestAsk !== undefined && bestBid !== undefined
      ? (bestAsk + bestBid) / 2n
      : (bestAsk ?? bestBid ?? book.fairPrice?.micros ?? 0n);
  rows.push({
    kind: "spread",
    price: mid,
    spread:
      bestAsk !== undefined && bestBid !== undefined
        ? bestAsk - bestBid
        : undefined,
  });
  bids.forEach((level, i) => {
    const cumulative = bidCum[i] ?? 0;
    rows.push({ kind: "bid", level, cumulative, depth: cumulative / deepest });
  });
  const insert = (row: Extract<BookRow, { kind: "fair" | "recall" }>) => {
    const at = rows.findIndex((r) => priceOf(r) < row.price);
    if (at < 0) rows.push(row);
    else rows.splice(at, 0, row);
  };
  if (book.recallCap) insert({ kind: "recall", price: book.recallCap.micros });
  if (book.fairPrice) insert({ kind: "fair", price: book.fairPrice.micros });
  return rows;
}

function priceOf(row: BookRow) {
  return "price" in row ? row.price : (row.level.price?.micros ?? 0n);
}
