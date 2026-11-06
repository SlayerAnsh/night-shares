import type { Book } from "../book/types";
import { FEE } from "../constants";
import { price } from "../curve";
import { cutoffRefund } from "../cutoff-refund";
import type { NightState } from "../night/night-state";
import { hash } from "../random/hash";
import { rng } from "../random/rng";
import { toTenths } from "../units";
export function nightAnalytics(
  state: NightState,
  bk: Book,
  hist: { fair: number[]; market: number[] },
  modelId: string,
  nightDate: string,
  hoursLeft: number,
  bookedBps: number,
) {
  const ps = state.pstar;
  const current = bk.asks.find((a) => !a.guestOnly)?.price ?? ps;
  const dl = Math.max(1, hoursLeft / 24);
  const trend = Math.max(
    -0.2,
    Math.min(0.2, (ps / (hist.fair[0] ?? ps) - 1) * Math.min(1, dl / 30) * 0.5),
  );
  const date = new Date(`${nightDate}T00:00:00Z`),
    weekend = [5, 6].includes(date.getUTCDay());
  const random = rng(hash(`st${modelId}${weekend}${date.getUTCMonth()}`))();
  const sell = Math.min(
    0.97,
    Math.max(
      0.3,
      bookedBps / 10000 +
        (weekend ? 0.07 : -0.03) +
        (state.peak ? 0.1 : 0) +
        (random - 0.5) * 0.08,
    ),
  );
  const qExp = Math.min(state.S - 0.1, state.q + sell * (state.S - state.q));
  const exit =
    sell *
      (0.5 * ps * (1 + trend) + 0.5 * price(state.F, state.k, state.S, qExp)) +
    (1 - sell) *
      (0.5 * ps * 0.9 * (1 - FEE) + 0.5 * cutoffRefund(state).perNight);
  const ret = (exit * (1 - FEE)) / (current * (1 + FEE)) - 1;
  const apy = Math.max(1e-4, 1 + ret) ** (365 / dl) - 1;
  const changes = hist.market
    .slice(1)
    .map((v, i) => v / (hist.market[i] ?? v) - 1);
  const mean = changes.reduce((a, b) => a + b, 0) / changes.length;
  const vol =
    Math.sqrt(
      changes.reduce((a, b) => a + (b - mean) ** 2, 0) / changes.length,
    ) * Math.sqrt(30);
  const buy = bk.asks
    .filter((a) => !a.guestOnly && Math.abs(a.price / ps - 1) <= 0.05)
    .reduce((a, b) => a + b.size, 0);
  const sellLiq = bk.bids
    .filter((b) => Math.abs(b.price / ps - 1) <= 0.05)
    .reduce((a, b) => a + b.size, 0);
  const score =
    vol * 1.5 +
    (1 - sell) * 1.2 +
    Math.max(0, current / ps - 1) * 2 +
    (buy + sellLiq < 0.3 ? 0.15 : 0);

  return {
    current,
    estimatedReturnBps: bps(ret),
    risk:
      score < 0.42
        ? ("low" as const)
        : score < 0.6
          ? ("medium" as const)
          : ("high" as const),
    riskScore: score,
    changeBps: bps(
      (hist.market[30] ?? current) / (hist.market[29] ?? current) - 1,
    ),
    annualizedReturnBps: bps(apy),
    volatilityBps: bps(vol),
    sellThroughBps: bps(sell),
    expectedExit: exit,
    worstRefund: cutoffRefund(state).perNight,
    buyLiquidityTenths: toTenths(buy),
    sellLiquidityTenths: toTenths(sellLiq),
  };
}
function bps(value: number) {
  return Math.max(-2147483648, Math.min(2147483647, Math.round(value * 10000)));
}
