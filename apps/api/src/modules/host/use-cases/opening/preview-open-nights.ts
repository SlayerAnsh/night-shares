import {
  cost,
  floorFromRate,
  hostPayout,
  lastRoomPrice,
  PRESETS,
  recallStrike,
  toMicros,
} from "@night-shares/market-model";
import type { OpenNightsSelection } from "@night-shares/proto/host/v1/opening_pb";
import type { HostDeps } from "../deps";
import { selectNights } from "./selection";
export function createPreviewOpenNights(deps: HostDeps) {
  return (userId: string, selection?: OpenNightsSelection) =>
    selectNights(deps, userId, selection).map(({ record, preset, tenths }) => {
      const F = floorFromRate(record.state.usualRate),
        k = PRESETS[preset],
        S = tenths / 10;
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
        securityHold: {
          micros: toMicros(hostPayout({ F, k, S, q: 0, held: 0 }).bondTarget),
        },
      };
    });
}
