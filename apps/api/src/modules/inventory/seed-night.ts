import { nightState } from "@night-shares/market-model";
import type { Clock } from "../../ports/clock/clock";
import { DomainError } from "../../shared/errors/domain-error";
import { format, type NightIdentity } from "../../shared/night-key";
import type { CatalogRepo } from "../catalog-data/catalog-repo";
import type { NightRecord } from "./inventory-repo";
export function seedNight(
  { catalog, clock }: { catalog: CatalogRepo; clock: Clock },
  night: NightIdentity,
): NightRecord {
  const key = format(night);
  const property = catalog.get(night.propertyId);
  const roomIndex =
    property?.roomTypes.findIndex((r) => r.id === night.roomTypeId) ?? -1;
  if (!property || roomIndex < 0)
    throw new DomainError("NOT_FOUND", "Property or room type not found.");
  const state = nightState({
    property: { ...property, id: property.modelId },
    roomIndex,
    date: night.date,
    today: clock.today(),
  });
  return { ...night, key, state, stopped: false, openedAt: clock.now() };
}
