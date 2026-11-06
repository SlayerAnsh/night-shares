import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import { toMicros } from "@night-shares/market-model";
import { addDays, parseDate } from "../../../../shared/dates";
import { card } from "../../mappers/analytics/card";
import { track } from "../../mappers/analytics/track";
import type { Deps } from "../context";
export function getNight({ ports }: Deps, key: string) {
  const record = ports.inventory.get(key),
    data = card(ports, record);
  const monthCalendar = [];
  const start = `${record.date.slice(0, 7)}-01`;
  for (
    let date = start;
    date.slice(0, 7) === start.slice(0, 7);
    date = addDays(date, 1)
  ) {
    monthCalendar.push(
      card(
        ports,
        ports.inventory.seedNight({
          propertyId: record.propertyId,
          roomTypeId: record.roomTypeId,
          date,
        }),
      ).card,
    );
  }
  return {
    night: data.card,
    stats: {
      ...data.stats,
      hostSoldBack: ports.activity
        .list({ nightKey: key, kinds: ["trader_sold_back"] })
        .some((event) => event.actor === "host"),
    },
    priceHistory: data.hist.market.map((price, index) => ({
      at: timestampFromMs(
        parseDate(ports.clock.today()) + (index - 30) * 86_400_000,
      ),
      price: { micros: toMicros(price) },
    })),
    hostTrackRecord: track(data.property),
    monthCalendar,
  };
}
