import {
  CAP_HUMAN,
  FLOOR_RATIO,
  PSTAR_BAND,
  RECALL_MARKUP,
  RECALL_MIN_MARKUP,
} from "./constants";

const ideal = (F: number, k: number, S: number, q: number) =>
  F * Math.exp((k * q) / S);

function room(F: number, k: number, S: number, i: number) {
  const lo = i,
    hi = Math.min(i + 1, S),
    sa = Math.sqrt(ideal(F, k, S, lo)),
    sb = Math.sqrt(ideal(F, k, S, hi));
  return { lo, hi, sa, L: (hi - lo) / (1 / sa - 1 / sb) };
}

const sqrtAt = (r: ReturnType<typeof room>, x: number) =>
  1 / (1 / r.sa - (x - r.lo) / r.L);

export const price = (F: number, k: number, S: number, q: number) => {
  if (k === 0) return F;
  const i = Math.max(0, Math.min(Math.floor(q + 1e-12), Math.ceil(S) - 1)),
    r = room(F, k, S, i);
  // biome-ignore lint/style/useExponentiationOperator: Preserve the frozen mock formula exactly.
  return Math.pow(sqrtAt(r, Math.min(Math.max(q, r.lo), r.hi)), 2);
};

export function cost(
  F: number,
  k: number,
  S: number,
  a: number,
  b: number,
): number {
  if (b < a) return -cost(F, k, S, b, a);
  if (k === 0) return F * (b - a);
  let total = 0;
  for (
    let i = Math.max(0, Math.floor(a + 1e-12));
    i < Math.ceil(b - 1e-12);
    i++
  ) {
    const r = room(F, k, S, i),
      x1 = Math.max(a, r.lo),
      x2 = Math.min(b, r.hi);
    if (x2 > x1) total += r.L * (sqrtAt(r, x2) - sqrtAt(r, x1));
  }
  return total;
}
export const lastRoomPrice = (F: number, k: number) => F * Math.exp(k);
export const recallStrike = (F: number, k: number, m = RECALL_MARKUP) => {
  if (m < RECALL_MIN_MARKUP) {
    throw new RangeError("recall markup m must be at least 5%");
  }
  return lastRoomPrice(F, k) * (1 + m);
};
export const floorFromRate = (usualRate: number) =>
  Math.round(usualRate * FLOOR_RATIO);
export const capOf = (S: number) => Math.max(1, CAP_HUMAN * S);

export const clampFair = (pstar: number, usualRate: number): number =>
  Math.min(
    PSTAR_BAND[1] * usualRate,
    Math.max(PSTAR_BAND[0] * usualRate, pstar),
  );
