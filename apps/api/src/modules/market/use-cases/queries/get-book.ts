import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import { lateFee, toMicros, toTenths } from "@night-shares/market-model";
import { source } from "../../mappers/route";
import { bookOf, type Deps, hoursLeft, releaseAt } from "../context";
export function getBook({ ports }: Deps, key: string) {
  const record = ports.inventory.get(key),
    bk = bookOf(ports, record);
  return {
    asks: bk.asks.map((a) => ({
      price: { micros: toMicros(a.price) },
      size: { tenths: toTenths(a.size) },
      source: source(a.src),
      guestOnly: a.guestOnly ?? false,
      askId: a.src === "trader" ? `${key}|${a.who}` : "",
    })),
    bids: bk.bids.map((b) => ({
      price: { micros: toMicros(b.price) },
      net: { micros: toMicros(b.net) },
      size: { tenths: toTenths(b.size) },
      source: source(b.src),
    })),
    recallCap: { micros: toMicros(bk.recall) },
    fairPrice: { micros: toMicros(record.state.pstar) },
    lateFeeBps: Math.round(lateFee(hoursLeft(ports, record)) * 10000),
    releaseAt: timestampFromMs(releaseAt(record)),
  };
}
