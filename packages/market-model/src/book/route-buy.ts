import { FEE } from "../constants";
import type { Book, BuyResult, Fill } from "./types";
export function routeBuy(
  bk: Book,
  amount: number,
  { guest = false }: { guest?: boolean } = {},
): BuyResult {
  let left = amount,
    spend = 0;
  const fills: Fill[] = [];
  for (const l of bk.asks) {
    if (left <= 1e-9) break;
    // Guests never pay above the recall cap. Asks are sorted, so stop here.
    if (guest && l.price > bk.recall) break;
    if (l.guestOnly && !guest) continue;
    const take = Math.min(left, l.size);
    spend += take * l.price;
    left -= take;
    fills.push({ ...l, take });
  }
  if (left > 1e-9 && guest) {
    spend += left * bk.recall;
    fills.push({ price: bk.recall, take: left, src: "recall" });
    left = 0;
  }
  const avg = amount - left > 0 ? spend / (amount - left) : 0;
  return {
    filled: amount - left,
    avg,
    gross: spend,
    total: spend * (1 + FEE),
    fee: spend * FEE,
    fills,
  };
}
