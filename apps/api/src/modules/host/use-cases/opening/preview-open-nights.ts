import {
  cost,
  floorFromRate,
  lastRoomPrice,
  PRESETS,
  recallStrike,
  toMicros,
} from "@night-shares/market-model";
import type { OpenNightsSelection } from "@night-shares/proto/host/v1/opening_pb";
import { chainLimits } from "../../../../ports/chain-status/chain-status";
import { assertChainPrices } from "../../chain-limits";
import type { HostDeps } from "../deps";
import { selectNights } from "./selection";
export function createPreviewOpenNights(deps: HostDeps) {
  return (userId: string, selection?: OpenNightsSelection) => {
    const plans = selectNights(deps, userId, selection);
    const nights = plans.map(({ record, preset, tenths }) => {
      const F = chainLimits(deps.ports)
          ? record.state.F
          : floorFromRate(record.state.usualRate),
        k = PRESETS[preset],
        S = tenths / 10;
      if (chainLimits(deps.ports)) assertChainPrices({ F, k, S });
      return {
        night: {
          propertyId: record.propertyId,
          roomTypeId: record.roomTypeId,
          date: record.date,
        },
        allotment: { tenths },
        floor: { micros: toMicros(F) },
        lastRoomPrice: { micros: toMicros(lastRoomPrice(F, k)) },
        guestPriceCap: { micros: toMicros(recallStrike(F, k)) },
        minimumPayout: { micros: toMicros(cost(F, k, S, 0, S)) },
      };
    });
    return {
      nights,
      slots: plans.length,
      kept: plans.filter((plan) => plan.kept).length,
    };
  };
}
