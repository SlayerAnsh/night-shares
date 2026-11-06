import {
  CAP_HUMAN,
  FLOOR_RATIO,
  PSTAR_BAND,
  RECALL_MARKUP,
  RECALL_MIN_MARKUP,
} from "./constants";
export const price = (F: number, k: number, S: number, q: number) =>
  F * Math.exp((k * q) / S);
export const cost = (F: number, k: number, S: number, a: number, b: number) =>
  k === 0
    ? F * (b - a)
    : ((F * S) / k) * (Math.exp((k * b) / S) - Math.exp((k * a) / S));
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
