import { create } from "@bufbuild/protobuf";
import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import {
  DiscoverSort,
  NightCardSchema,
  NightStatsSchema,
} from "@night-shares/proto/market/v1/analytics_pb";
import type { DiscoverRequest } from "@night-shares/proto/market/v1/market_pb";
import type { User } from "../../../ports/sessions/session-store";
import { addDays } from "../../../shared/dates";
import { toProto } from "../../../shared/night-key";
import type { NightRecord } from "../../inventory/inventory-repo";
import type { Deps } from "../use-cases/context";
import { openedNight, openedNights } from "./nights";
import { chainPool } from "./pool";
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
  const records = (await openedNights(deps.ports)).filter(
    (r) =>
      !r.stopped &&
      r.date >= today &&
      r.date < addDays(today, input.soon ? 15 : 75) &&
      (!input.watchlist || watch.has(r.key)),
  );
  const nights = (
    await Promise.all(records.map(async (r) => (await chainCard(deps, r)).card))
  ).filter(
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
  const data = await chainCard(deps, record);
  return {
    night: data.card,
    stats: data.stats,
    tradingPaused: await paused(deps),
    priceHistory: [],
    monthCalendar: await Promise.all(
      (await openedNights(deps.ports))
        .filter(
          (r) =>
            r.propertyId === record.propertyId &&
            r.roomTypeId === record.roomTypeId &&
            r.date.slice(0, 7) === record.date.slice(0, 7),
        )
        .map(async (r) => (await chainCard(deps, r)).card),
    ),
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

async function chainCard(deps: Deps, record: NightRecord) {
  const property = deps.ports.catalog.get(record.propertyId);
  const pool = await chainPool(deps.ports, record.key);
  // Opening parameters define the curve, not demand or a fair-value forecast.
  // Absent forecasts deliberately leave optional money fields unset.
  return {
    card: create(NightCardSchema, {
      night: toProto(record.key),
      propertyName: property?.name,
      roomTypeName: property?.roomTypes.find((r) => r.id === record.roomTypeId)
        ?.name,
      city: property?.city,
      price: { micros: pool.spot },
      releaseAt: timestampFromMs(Number(pool.config.cutoff) * 1000),
    }),
    stats: create(NightStatsSchema, {
      worstRefund:
        pool.refund === undefined ? undefined : { micros: pool.refund },
      buyLiquidity: { tenths: pool.asks.length },
      sellLiquidity: { tenths: pool.bids.length },
    }),
  };
}
