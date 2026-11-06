import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import { lateFee, toMicros } from "@night-shares/market-model";
import { chainStatus } from "../../../../ports/chain-status/chain-status";
import { toWholeTenths } from "../../../../shared/tenths";
import { source } from "../../mappers/route";
import {
  bookOf,
  type Deps,
  hoursLeft,
  releaseAt,
  syncPosition,
} from "../context";
import { isHost } from "../trading/host-fees";
export function getBook(deps: Deps, key: string) {
  const { ports, repo } = deps;
  const record = ports.inventory.get(key),
    bk = bookOf(ports, record);
  return {
    tradingPaused: chainStatus(ports).isPaused(key),
    holders: repo
      .holders(key)
      .map((user) => {
        const position = syncPosition(deps, user, record);
        return {
          walletAddress: user.walletAddress,
          size: { tenths: position.free + position.escrow },
          isHost: isHost(ports, record.propertyId, user),
        };
      })
      .filter((h) => h.size.tenths > 0),
    asks: bk.asks.map((a) => ({
      price: { micros: toMicros(a.price) },
      size: { tenths: toWholeTenths(a.size) },
      source: source(a.src),
      askId: a.src === "trader" ? `${key}|${a.who}` : "",
    })),
    bids: bk.bids.map((b) => ({
      price: { micros: toMicros(b.price) },
      net: { micros: toMicros(b.net) },
      size: { tenths: toWholeTenths(b.size) },
      source: source(b.src),
    })),
    recallCap: { micros: toMicros(bk.recall) },
    fairPrice: { micros: toMicros(record.state.pstar) },
    lateFeeBps: Math.round(lateFee(hoursLeft(ports, record)) * 10000),
    releaseAt: timestampFromMs(releaseAt(record)),
  };
}
