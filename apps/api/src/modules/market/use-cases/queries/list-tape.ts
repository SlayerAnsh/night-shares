import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import { TradeSide } from "@night-shares/proto/market/v1/analytics_pb";
import type { Deps } from "../context";
export function listTape({ ports }: Deps, key: string) {
  ports.inventory.get(key);
  return {
    prints: ports.activity
      .list({
        nightKey: key,
        kinds: [
          "guest_booked",
          "trader_bought",
          "trader_sold_back",
          "ask_filled",
        ],
        limit: 40,
      })
      .map((event) => ({
        id: event.id,
        price: { micros: event.priceMicros ?? 0n },
        size: { tenths: event.tenths },
        side:
          event.actor === "pool" || event.kind === "trader_sold_back"
            ? TradeSide.SELL
            : TradeSide.BUY,
        at: timestampFromMs(event.at),
      })),
  };
}
