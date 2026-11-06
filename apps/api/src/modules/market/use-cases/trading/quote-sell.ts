import { create } from "@bufbuild/protobuf";
import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import {
  capOf,
  FEE,
  lateFee,
  toMicros,
  toTenths,
} from "@night-shares/market-model";
import {
  BookSource,
  RouteQuoteSchema,
} from "@night-shares/proto/market/v1/book_pb";
import type { User } from "../../../../ports/sessions/session-store";
import { mulTenths } from "../../../../shared/money";
import { toProto } from "../../../../shared/night-key";
import type { NightRecord } from "../../../inventory/inventory-repo";
import {
  bookOf,
  type Deps,
  hoursLeft,
  releaseAt,
  syncPosition,
} from "../context";
export function quoteSell(
  deps: Deps,
  key: string,
  size: number,
  user?: User,
  record: NightRecord = deps.ports.inventory.get(key),
) {
  let left = size,
    gross = 0n,
    net = 0n;
  const fills = [];
  for (const bid of bookOf(deps.ports, record).bids) {
    const take = Math.min(left, toTenths(bid.size));
    if (!take) break;
    gross += mulTenths(toMicros(bid.price), take);
    net += mulTenths(toMicros(bid.net), take);
    left -= take;
    fills.push({
      price: { micros: toMicros(bid.price) },
      size: { tenths: take },
      source: BookSource.SELL_BACK,
    });
  }
  const position = user ? syncPosition(deps, user, record) : undefined;
  return create(RouteQuoteSchema, {
    night: toProto(key),
    requested: { tenths: size },
    filled: { tenths: size - left },
    fills,
    average: { micros: size > left ? (gross * 10n) / BigInt(size - left) : 0n },
    gross: { micros: gross },
    fee: { micros: gross - net },
    total: { micros: net },
    lateFee: {
      micros: lateFee(hoursLeft(deps.ports, record)) > FEE ? gross - net : 0n,
    },
    unsoldRefund: { micros: 0n },
    capUsed: { tenths: position ? position.free + position.escrow : 0 },
    cap: { tenths: toTenths(capOf(record.state.S, record.state.peak)) },
    releaseAt: timestampFromMs(releaseAt(record)),
  });
}
