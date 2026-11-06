import type { BuyResult } from "@night-shares/market-model";
import { toWholeTenths } from "../../../../shared/tenths";
import type { NightRecord } from "../../../inventory/inventory-repo";
import { applyPoolSell } from "../../../inventory/mutations/apply-pool-sell";

export function revertFills(
  record: NightRecord,
  route: BuyResult,
  before: NightRecord,
) {
  for (const fill of route.fills) toWholeTenths(fill.take);
  let next = record;
  for (const fill of route.fills) {
    if (fill.src === "pool")
      next = applyPoolSell(next, toWholeTenths(fill.take));
    if (fill.src !== "trader") continue;
    const original = before.state.traderAsks.find(
      (a) => a.who === fill.who && a.price === fill.price,
    );
    if (!original) continue;
    const asks = next.state.traderAsks.map((a) => ({ ...a }));
    const ask = asks.find((a) => a.who === fill.who && a.price === fill.price);
    if (ask) ask.size = toWholeTenths(ask.size + fill.take) / 10;
    else asks.push({ ...original, size: fill.take });
    next = { ...next, state: { ...next.state, traderAsks: asks } };
  }
  return next;
}
