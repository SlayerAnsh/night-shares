import { type BuyResult, toTenths } from "@night-shares/market-model";
import type { NightRecord } from "../../../inventory/inventory-repo";
import { applyPoolSell } from "../../../inventory/mutations/apply-pool-sell";

export function revertFills(
  record: NightRecord,
  route: BuyResult,
  before: NightRecord,
) {
  let next = record;
  for (const fill of route.fills) {
    if (fill.src === "pool") next = applyPoolSell(next, toTenths(fill.take));
    if (fill.src !== "trader") continue;
    const original = before.state.traderAsks.find(
      (a) => a.who === fill.who && a.price === fill.price,
    );
    if (!original) continue;
    const asks = next.state.traderAsks.map((a) => ({ ...a }));
    const ask = asks.find((a) => a.who === fill.who && a.price === fill.price);
    if (ask) ask.size = Math.round((ask.size + fill.take) * 10) / 10;
    else asks.push({ ...original, size: fill.take });
    next = { ...next, state: { ...next.state, traderAsks: asks } };
  }
  return next;
}
