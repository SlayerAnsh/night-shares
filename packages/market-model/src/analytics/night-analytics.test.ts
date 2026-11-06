import { expect, test } from "bun:test";
import { book, nightState } from "../index";
import { hostTrackRecord } from "./host-track-record";
import { nightAnalytics } from "./night-analytics";
import { priceHistory } from "./price-history";

test("night analytics retain returns, risk, liquidity and sell-through", () => {
  const property = {
    id: "velana",
    modelId: "velana",
    base: 300,
    phase: 0,
    rooms: 20,
    popular: true,
    roomTypes: [{ rateMultiplier: 1 }],
  };
  const state = nightState({
    property,
    roomIndex: 0,
    date: "2026-12-24",
    today: "2026-12-01",
  });
  const history = priceHistory(property.modelId, 0, "2026-12-24", state);
  const result = nightAnalytics(
    state,
    book(state),
    history,
    property.modelId,
    "2026-12-24",
    566,
    hostTrackRecord(property).bookedBps,
  );
  expect(result).toMatchObject({
    estimatedReturnBps: 6,
    annualizedReturnBps: 99,
    risk: "low",
    changeBps: 187,
    volatilityBps: 847,
    sellThroughBps: 7924,
    buyLiquidityTenths: 8,
    sellLiquidityTenths: 8,
  });
  expect(result.expectedExit).toBeCloseTo(830.9431537439161, 9);
  expect(result.worstRefund).toBe(state.pstar * 0.5);
  expect(result.riskScore).toBeCloseTo(0.4039232405055009, 12);
  const empty = nightAnalytics(
    state,
    { asks: [], bids: [], recall: 0 },
    history,
    property.modelId,
    "2026-12-24",
    0,
    0,
  );
  expect(empty.current).toBe(state.pstar);
  expect(empty.buyLiquidityTenths).toBe(0);
  expect(empty.sellLiquidityTenths).toBe(0);
  expect(empty.risk).toBe("high");
  expect(Number.isFinite(empty.annualizedReturnBps)).toBe(true);
});
