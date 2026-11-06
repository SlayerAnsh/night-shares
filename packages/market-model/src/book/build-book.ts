import { SLICE } from "../constants";
import { cost, recallStrike } from "../curve";
import { lateFee } from "../fees";
import type { Ask, Bid, Book, BookInput } from "./types";
export function book({
  F,
  k,
  S,
  q,
  tranche = 0,
  traderAsks = [],
  levels = 8,
  hoursLeft = 999,
}: BookInput): Book {
  const asks: Ask[] = [],
    bids: Bid[] = [];
  const traderLimit = S - tranche; // traders cannot buy into the guest tranche
  for (let i = 0, a = q; i < levels && a + SLICE <= S + 1e-9; i++, a += SLICE)
    asks.push({
      price: cost(F, k, S, a, a + SLICE) / SLICE,
      size: SLICE,
      src: "pool",
      guestOnly: a + SLICE > traderLimit + 1e-9,
    });
  for (const t of traderAsks) {
    asks.push({ price: t.price, size: t.size, src: "trader", who: t.who });
  }
  asks.sort((x, y) => x.price - y.price);
  const fs = lateFee(hoursLeft);
  for (let i = 0, b = q; i < levels && b - SLICE >= -1e-9; i++, b -= SLICE) {
    const g = cost(F, k, S, b - SLICE, b) / SLICE;
    bids.push({ price: g, net: g * (1 - fs), size: SLICE, src: "sell-back" });
  }
  return { asks, bids, recall: recallStrike(F, k) };
}
