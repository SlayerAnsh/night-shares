import { priceHistory } from "@night-shares/market-model";
import type { CatalogProperty } from "../../../catalog-data/catalog-repo";
import type { NightRecord } from "../../../inventory/inventory-repo";
export function history(property: CatalogProperty, record: NightRecord) {
  return priceHistory(
    property.modelId,
    property.roomTypes.findIndex((r) => r.id === record.roomTypeId),
    record.date,
    record.state,
  );
}
