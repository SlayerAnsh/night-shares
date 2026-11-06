import { create } from "@bufbuild/protobuf";
import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import {
  type BuyResult,
  capOf,
  cutoffRefund,
  toMicros,
  toTenths,
} from "@night-shares/market-model";
import {
  BookSource,
  RouteQuoteSchema,
} from "@night-shares/proto/market/v1/book_pb";
import { mulTenths } from "../../../shared/money";
import { toProto } from "../../../shared/night-key";
import type { NightRecord } from "../../inventory/inventory-repo";
import { releaseAt } from "../use-cases/context";
export const source = (src: string) =>
  src === "pool"
    ? BookSource.POOL
    : src === "trader"
      ? BookSource.TRADER
      : src === "recall"
        ? BookSource.RECALL
        : BookSource.SELL_BACK;
export function buyQuote(
  record: NightRecord,
  size: number,
  result: BuyResult,
  used: number,
  cutoff = releaseAt(record),
) {
  return create(RouteQuoteSchema, {
    night: toProto(record.key),
    requested: { tenths: size },
    filled: { tenths: toTenths(result.filled) },
    fills: result.fills.map((f) => ({
      price: { micros: toMicros(f.price) },
      size: { tenths: toTenths(f.take) },
      source: source(f.src),
      askId: f.src === "trader" ? `${record.key}|${f.who}` : "",
    })),
    average: { micros: toMicros(result.avg) },
    gross: { micros: toMicros(result.gross) },
    fee: { micros: toMicros(result.fee) },
    total: { micros: toMicros(result.gross) + toMicros(result.fee) },
    capUsed: { tenths: used },
    cap: { tenths: toTenths(capOf(record.state.S, record.state.peak)) },
    lateFee: { micros: 0n },
    unsoldRefund: {
      micros: mulTenths(
        toMicros(cutoffRefund(record.state).perNight),
        toTenths(result.filled),
      ),
    },
    releaseAt: timestampFromMs(cutoff),
  });
}
