import { recallStrike, routeBuy, toMicros } from "@night-shares/market-model";
import { PriceSource } from "@night-shares/proto/stay/v1/trip_pb";
import type { Ports } from "../../../container/ports";
import { DomainError } from "../../../shared/errors/domain-error";
import { quoteNight } from "./quote-night";

export function calendarNight(
  ports: Ports,
  propertyId: string,
  roomTypeId: string,
  date: string,
) {
  const record = ports.inventory.seedNight({ propertyId, roomTypeId, date });
  if (!record.released) {
    try {
      return {
        ...quoteNight(ports, propertyId, roomTypeId, date),
        isSoldOut: false,
      };
    } catch (error) {
      if (
        !(error instanceof DomainError) ||
        error.code !== "FAILED_PRECONDITION" ||
        !["This night is sold out.", "This night has closed."].includes(
          error.message,
        )
      )
        throw error;
    }
  }
  // Unavailable nights still display the guest recall cap, including the booking fee.
  const recall = recallStrike(record.state.F, record.state.k);
  const route = routeBuy({ asks: [], bids: [], recall }, 1, { guest: true });
  const hasPrice = Number.isFinite(route.total) && route.total >= 0;
  return {
    date,
    price: { micros: hasPrice ? toMicros(route.total) : 0n },
    usualRate: { micros: toMicros(record.state.usualRate) },
    source: hasPrice ? PriceSource.RECALL_CAP : PriceSource.HOTEL,
    isSoldOut: true,
  };
}
