import type { AgentStrategy as ProtoStrategy } from "@night-shares/proto/agent/v1/strategy_pb";
import type { NightKey } from "@night-shares/proto/common/v1/night_pb";
import { type AgentStrategy, parseStrategy } from "./schema";

const night = ({ propertyId, roomTypeId, date }: NightKey) => ({
  propertyId,
  roomTypeId,
  date,
});

export function strategyFromProto(value: ProtoStrategy): AgentStrategy {
  const { markets, entry, exit, sizing } = value;
  return parseStrategy({
    version: value.version,
    markets: markets && {
      propertyIds: markets.propertyIds,
      nights: markets.nights.map(night),
      dateFrom: markets.dateFrom,
      dateTo: markets.dateTo,
      weekdays: markets.weekdays,
      disabled: markets.disabled.map(night),
    },
    entry: entry && {
      maxPriceVsFairBps: entry.maxPriceVsFairBps,
      minHoursToRelease: entry.minHoursToRelease,
      maxHoursToRelease: entry.maxHoursToRelease,
      momentumLookbackHours: entry.momentumLookbackHours,
      momentumMinRiseBps: entry.momentumMinRiseBps,
    },
    exit: exit && {
      takeProfitBps: exit.takeProfitBps,
      stopLossBps: exit.stopLossBps,
      exitHoursBeforeRelease: exit.exitHoursBeforeRelease,
    },
    sizing: {
      maxPerNight: sizing?.maxPerNight?.tenths,
      maxPerTrade: sizing?.maxPerTrade?.tenths,
    },
  });
}
