import { DiscoverSort } from "@night-shares/proto/market/v1/analytics_pb";
import type { DiscoverRequest } from "@night-shares/proto/market/v1/market_pb";
import type { User } from "../../../ports/sessions/session-store";
import { addDays } from "../../../shared/dates";
import { card } from "../mappers/analytics/card";
import type { Deps } from "../use-cases/context";
import { openedNight, openedNights } from "./nights";
import { chainMarket } from "./runtime";

export async function chainDiscover(
  deps: Deps,
  input: Pick<
    DiscoverRequest,
    "city" | "sort" | "soon" | "valueOnly" | "watchlist"
  >,
  user?: User,
) {
  const watch = user
    ? deps.repo.account(user.humanId).watch
    : new Set<string>();
  const today = deps.ports.clock.today();
  const nights = (await openedNights(deps.ports))
    .filter(
      (r) =>
        !r.stopped &&
        r.date >= today &&
        r.date < addDays(today, input.soon ? 15 : 75) &&
        (!input.watchlist || watch.has(r.key)),
    )
    .map((r) => card(deps.ports, r).card)
    .filter(
      (c) =>
        (!input.city ||
          input.city === "all" ||
          c.city.toLowerCase() === input.city.toLowerCase()) &&
        (!input.valueOnly ||
          (c.price?.micros ?? 0n) * 100n <= (c.fairPrice?.micros ?? 0n) * 98n),
    );
  nights.sort((a, b) =>
    input.sort === DiscoverSort.RISK
      ? a.risk - b.risk || b.estimatedReturnBps - a.estimatedReturnBps
      : b.estimatedReturnBps - a.estimatedReturnBps,
  );
  return { nights, tradingPaused: await paused(deps) };
}
export async function chainNight(deps: Deps, key: string) {
  const record = await openedNight(deps.ports, key);
  const data = card(deps.ports, record);
  return {
    night: data.card,
    stats: data.stats,
    tradingPaused: await paused(deps),
    priceHistory: [],
    monthCalendar: (await openedNights(deps.ports))
      .filter(
        (r) =>
          r.propertyId === record.propertyId &&
          r.roomTypeId === record.roomTypeId &&
          r.date.slice(0, 7) === record.date.slice(0, 7),
      )
      .map((r) => card(deps.ports, r).card),
  };
}
async function paused(deps: Deps) {
  return (
    await chainMarket(deps.ports).reader.read<boolean>({
      contract: "NightHook",
      functionName: "paused",
    })
  ).value;
}
