import { DiscoverSort } from "@night-shares/proto/market/v1/analytics_pb";
import type { DiscoverRequest } from "@night-shares/proto/market/v1/market_pb";
import type { User } from "../../../../ports/sessions/session-store";
import { addDays } from "../../../../shared/dates";
import { card } from "../../mappers/analytics/card";
import type { Deps } from "../context";
export function discover(
  deps: Deps,
  input: Pick<
    DiscoverRequest,
    "city" | "sort" | "soon" | "valueOnly" | "watchlist"
  >,
  user?: User,
) {
  const nights = [];
  const watch = user
    ? deps.repo.account(user.humanId).watch
    : new Set<string>();
  for (const property of deps.ports.catalog.list()) {
    if (
      input.city &&
      input.city !== "all" &&
      property.city.toLowerCase() !== input.city.toLowerCase()
    )
      continue;
    for (const room of property.roomTypes)
      for (let day = 0; day < (input.soon ? 15 : 75); day++) {
        const record = deps.ports.inventory.seedNight({
          propertyId: property.id,
          roomTypeId: room.id,
          date: addDays(deps.ports.clock.today(), day),
        });
        if (input.watchlist && !watch.has(record.key)) continue;
        const mapped = card(deps.ports, record).card;
        if (
          input.valueOnly &&
          (mapped.price?.micros ?? 0n) * 100n >
            (mapped.fairPrice?.micros ?? 0n) * 98n
        )
          continue;
        nights.push(mapped);
      }
  }
  nights.sort((a, b) =>
    input.sort === DiscoverSort.RISK
      ? a.risk - b.risk || b.estimatedReturnBps - a.estimatedReturnBps
      : b.estimatedReturnBps - a.estimatedReturnBps,
  );
  return { nights };
}
