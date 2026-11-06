import { nightPrice } from "@night-shares/market-model";
import type { CatalogRepo } from "../../modules/catalog-data/catalog-repo";
import { DomainError } from "../../shared/errors/domain-error";
import { fromUsd } from "../../shared/money";
import type { Clock } from "../clock/clock";
import type { IdGenerator } from "../ids/id-generator";
import type { ChannelManager } from "./channel-manager";
export function createMockChannelManager({
  catalog,
  ids,
  clock,
}: {
  catalog: CatalogRepo;
  ids: IdGenerator;
  clock: Clock;
}): ChannelManager {
  const reservations = new Map<string, string>();
  return {
    async connect({ propertyId, pms }) {
      if (!["mews", "cloudbeds", "siteminder"].includes(pms.toLowerCase()))
        throw new DomainError("INVALID_ARGUMENT", "Unsupported PMS.");
      const property = catalog.get(propertyId);
      if (!property) throw new DomainError("NOT_FOUND", "Property not found.");
      const rate = nightPrice(
        { ...property, id: property.modelId },
        clock.today(),
      );
      return {
        roomTypes: property.roomTypes.map((r) => ({
          ...r,
          usualRate: fromUsd(Math.round(rate * r.rateMultiplier)),
        })),
      };
    },
    async pushReservation(input) {
      const property = catalog.get(input.propertyId);
      if (!property || !catalog.getRoomType(input.propertyId, input.roomTypeId))
        throw new DomainError("NOT_FOUND", "Property or room type not found.");
      const existing = reservations.get(input.bookingId);
      if (existing) return { hotelRef: existing };
      const sequence = ids.next("reservation").split("_").at(-1) ?? "0";
      const hotelRef = `${property.code.slice(0, 3).toUpperCase()}-${sequence.padStart(6, "0")}`;
      reservations.set(input.bookingId, hotelRef);
      return { hotelRef };
    },
  };
}
