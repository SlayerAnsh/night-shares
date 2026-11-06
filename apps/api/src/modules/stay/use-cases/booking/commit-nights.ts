import { type BuyResult, toMicros, toTenths } from "@night-shares/market-model";
import type { Ports } from "../../../../container/ports";
import { revertFills } from "../../../market/use-cases/trading/revert-fills";
import { routeNight } from "../../pricing/quote-night";
import { fillNight } from "./fill-night";

export function commitNights(
  ports: Ports,
  nights: { key: string; route: BuyResult }[],
  rooms: number,
  propertyId: string,
  userId: string,
) {
  // Validate every night before the synchronous commit loop; no awaits separate updates.
  for (const night of nights)
    fillNight(ports.inventory.get(night.key), night.route, rooms);
  const before = nights.map((night) => ports.inventory.get(night.key));
  for (const night of nights) {
    ports.inventory.update(night.key, (record) => {
      night.route = routeNight(record, rooms);
      return fillNight(record, night.route, rooms);
    });
  }
  return {
    revert() {
      for (const [index, night] of nights.entries()) {
        const original = before[index];
        if (!original) continue;
        ports.inventory.update(night.key, (record) =>
          revertFills(
            {
              ...record,
              state: {
                ...record.state,
                booked: Math.round((record.state.booked - rooms) * 10) / 10,
                held: Math.round((record.state.held + rooms) * 10) / 10,
              },
            },
            night.route,
            original,
          ),
        );
      }
    },
    publish() {
      for (const night of nights) {
        const event = {
          nightKey: night.key,
          propertyId,
          actor: "guest" as const,
          userId,
        };
        ports.activity.append({
          ...event,
          kind: "guest_booked",
          tenths: rooms * 10,
          priceMicros: toMicros(night.route.avg),
        });
        for (const fill of night.route.fills.filter((f) => f.src === "trader"))
          ports.activity.append({
            ...event,
            kind: "ask_filled",
            tenths: toTenths(fill.take),
            priceMicros: toMicros(fill.price),
          });
      }
    },
  };
}
