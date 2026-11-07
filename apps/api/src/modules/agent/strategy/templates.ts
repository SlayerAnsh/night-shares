import type { AgentStrategy } from "./schema";

function strategy(
  entry: Partial<AgentStrategy["entry"]>,
  exit: Partial<AgentStrategy["exit"]>,
  weekdays: number[] = [],
): AgentStrategy {
  return {
    version: 1,
    markets: {
      propertyIds: [],
      nights: [],
      dateFrom: "",
      dateTo: "",
      weekdays,
      disabled: [],
    },
    entry: {
      maxPriceVsFairBps: 0,
      minHoursToRelease: 0,
      maxHoursToRelease: 2160,
      momentumLookbackHours: 0,
      momentumMinRiseBps: 0,
      ...entry,
    },
    exit: {
      takeProfitBps: 500,
      stopLossBps: 1500,
      exitHoursBeforeRelease: 48,
      ...exit,
    },
    sizing: { maxPerNight: 10, maxPerTrade: 5 },
  };
}

export const AGENT_TEMPLATES: Record<
  "buy-the-dip" | "long-dated" | "holiday-momentum",
  { name: string; strategy: AgentStrategy }
> = {
  "buy-the-dip": {
    name: "Buy the dip",
    strategy: strategy({ maxPriceVsFairBps: 300 }, {}),
  },
  "long-dated": {
    name: "Long dated",
    strategy: strategy(
      { minHoursToRelease: 720 },
      { takeProfitBps: 800, exitHoursBeforeRelease: 168 },
    ),
  },
  "holiday-momentum": {
    name: "Holiday momentum",
    strategy: strategy(
      { momentumLookbackHours: 24, momentumMinRiseBps: 200 },
      { takeProfitBps: 600, exitHoursBeforeRelease: 24 },
      [5, 6],
    ),
  },
};
