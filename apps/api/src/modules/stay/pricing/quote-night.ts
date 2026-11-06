import { book, routeBuy, toMicros } from "@night-shares/market-model";
import { PriceSource } from "@night-shares/proto/stay/v1/trip_pb";
import type { Ports } from "../../../container/ports";
import { DomainError } from "../../../shared/errors/domain-error";
import { toWholeTenths } from "../../../shared/tenths";
import type { NightRecord } from "../../inventory/inventory-repo";

export function routeNight(record: NightRecord, rooms: number) {
  if (record.stopped || record.state.booked + rooms > record.state.S)
    throw new DomainError("FAILED_PRECONDITION", "This night is sold out.");
  const route = routeBuy(
    book({ ...record.state, levels: Math.ceil(record.state.S * 10) }),
    rooms,
    { guest: true, recallable: record.state.held },
  );
  if (toWholeTenths(route.filled) !== rooms * 10)
    throw new DomainError("FAILED_PRECONDITION", "This night is sold out.");
  for (const fill of route.fills) toWholeTenths(fill.take);
  return route;
}
export function quoteNight(
  ports: Ports,
  propertyId: string,
  roomTypeId: string,
  date: string,
  rooms = 1,
) {
  const record = ports.inventory.seedNight({ propertyId, roomTypeId, date });
  const route = routeNight(record, rooms);
  const cheapest = route.fills.reduce<(typeof route.fills)[number] | undefined>(
    (a, b) => (!a || b.price < a.price ? b : a),
    undefined,
  );
  return {
    date,
    price: { micros: toMicros(route.total) },
    usualRate: { micros: toMicros(record.state.usualRate) * BigInt(rooms) },
    source:
      cheapest?.src === "trader"
        ? PriceSource.TRADER
        : cheapest?.src === "recall"
          ? PriceSource.RECALL_CAP
          : PriceSource.HOTEL,
    fee: toMicros(route.fee),
  };
}
