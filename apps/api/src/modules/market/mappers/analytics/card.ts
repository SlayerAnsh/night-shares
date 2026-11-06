import { create } from "@bufbuild/protobuf";
import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import {
  hostTrackRecord,
  nightAnalytics,
  toMicros,
} from "@night-shares/market-model";
import {
  NightCardSchema,
  NightStatsSchema,
  Risk,
} from "@night-shares/proto/market/v1/analytics_pb";
import type { Ports } from "../../../../container/ports";
import { toProto } from "../../../../shared/night-key";
import type { NightRecord } from "../../../inventory/inventory-repo";
import { bookOf, hoursLeft, releaseAt } from "../../use-cases/context";
import { history } from "./history";
export function card(ports: Ports, record: NightRecord) {
  const property = ports.catalog.get(record.propertyId);
  if (!property) throw new Error("Inventory property is missing.");
  const state = record.state,
    bk = bookOf(ports, record),
    ps = state.pstar;
  const hist = history(property, record);
  const analytics = nightAnalytics(
    state,
    bk,
    hist,
    property.modelId,
    record.date,
    hoursLeft(ports, record),
    hostTrackRecord(property).bookedBps,
  );
  return {
    card: create(NightCardSchema, {
      night: toProto(record.key),
      propertyName: property.name,
      roomTypeName: property.roomTypes.find((r) => r.id === record.roomTypeId)
        ?.name,
      city: property.city,
      price: { micros: toMicros(analytics.current) },
      fairPrice: { micros: toMicros(ps) },
      estimatedReturnBps: analytics.estimatedReturnBps,
      risk: { low: Risk.LOW, medium: Risk.MEDIUM, high: Risk.HIGH }[
        analytics.risk
      ],
      releaseAt: timestampFromMs(releaseAt(record)),
      changeBps: analytics.changeBps,
    }),
    stats: create(NightStatsSchema, {
      annualizedReturnBps: analytics.annualizedReturnBps,
      volatilityBps: analytics.volatilityBps,
      sellThroughBps: analytics.sellThroughBps,
      expectedExit: { micros: toMicros(analytics.expectedExit) },
      worstRefund: { micros: toMicros(analytics.worstRefund) },
      buyLiquidity: { tenths: analytics.buyLiquidityTenths },
      sellLiquidity: { tenths: analytics.sellLiquidityTenths },
    }),
    hist,
    property,
  };
}
