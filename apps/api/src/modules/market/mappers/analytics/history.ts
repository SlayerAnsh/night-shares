import { clampFair, hash, price, rng } from "@night-shares/market-model";
import type { CatalogProperty } from "../../../catalog-data/catalog-repo";
import type { NightRecord } from "../../../inventory/inventory-repo";
export function history(property: CatalogProperty, record: NightRecord) {
  const index = property.roomTypes.findIndex((r) => r.id === record.roomTypeId);
  const random = rng(hash(`h${property.modelId}|${index}|${record.date}`));
  const state = record.state;
  const fair = [state.pstar],
    market = [price(state.F, state.k, state.S, state.q)];
  for (let i = 1; i < 31; i++) {
    fair.unshift(
      clampFair(
        (fair[0] ?? state.pstar) * (1 + (random() - 0.55) * 0.05),
        state.usualRate,
      ),
    );
    market.unshift((market[0] ?? state.pstar) * (1 + (random() - 0.55) * 0.06));
  }
  return { fair, market };
}
