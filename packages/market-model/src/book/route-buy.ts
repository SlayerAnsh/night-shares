import { FEE } from "../constants";
import type { Book, BuyResult, Fill } from "./types";
export function routeBuy(
  bk: Book,
  amount: number,
  {
    guest = false,
    recallable = Infinity,
  }: { guest?: boolean; recallable?: number } = {},
): BuyResult {
  let left = amount,
    spend = 0;
  const fills: Fill[] = [];
  for (const l of bk.asks) {
    if (left <= 1e-9) break;
    // Guests never pay above the recall cap. Asks are sorted, so stop here.
    if (guest && l.price > bk.recall) break;
    const take = Math.min(left, l.size);
    spend += take * l.price;
    left -= take;
    fills.push({ ...l, take });
  }
  if (left > 1e-9 && guest) {
    const usedTrader = fills.reduce(
      (total, fill) => total + (fill.src === "trader" ? fill.take : 0),
      0,
    );
    const take = Math.min(left, Math.max(0, recallable - usedTrader));
    if (take > 1e-9) {
      spend += take * bk.recall;
      fills.push({ price: bk.recall, take, src: "recall" });
      left -= take;
    }
  }
  const avg = amount - left > 0 ? spend / (amount - left) : 0;
  let sellerFees = 0,
    sellerNet = 0;
  // Trader and recall sellers pay the base fee on their filled notional.
  for (const fill of fills) {
    if (fill.src === "trader" || fill.src === "recall") {
      fill.sellerFee = fill.take * fill.price * FEE;
      fill.sellerNet = fill.take * fill.price * (1 - FEE);
      sellerFees += fill.sellerFee;
      sellerNet += fill.sellerNet;
    }
  }
  return {
    filled: amount - left,
    avg,
    gross: spend,
    total: spend * (1 + FEE),
    fee: spend * FEE,
    fills,
    sellerFees,
    sellerNet,
  };
}
