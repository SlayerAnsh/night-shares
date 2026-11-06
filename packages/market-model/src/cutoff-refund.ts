import { LATE_MAX } from "./constants";
import { cost } from "./curve";

export interface CutoffRefundInput {
  F: number;
  k: number;
  S: number;
  q: number;
  held: number;
}

// At cutoff, holders share the held reserve pro rata, less the pool's late haircut.
export function cutoffRefund({ F, k, S, q, held }: CutoffRefundInput) {
  if (!(held > 1e-9)) return { avgBid: 0, perNight: 0, total: 0, haircut: 0 };
  const L = cost(F, k, S, q - held, q),
    avgBid = L / held;
  return {
    avgBid,
    perNight: avgBid * (1 - LATE_MAX),
    total: L * (1 - LATE_MAX),
    haircut: L * LATE_MAX,
  };
}
