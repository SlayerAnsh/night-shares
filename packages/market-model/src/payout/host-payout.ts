import { BOND } from "../constants";
import { cost } from "../curve";

export interface PayoutInput {
  F: number;
  k: number;
  S: number;
  q: number;
  held: number;
}
export function hostPayout(st: PayoutInput) {
  const R = cost(st.F, st.k, st.S, 0, st.q),
    L = cost(st.F, st.k, st.S, st.q - st.held, st.q);
  const bondTarget = BOND * st.F * st.S;
  const bondHeld = Math.min(bondTarget, R - L);
  return {
    gross: R,
    availableNow: R - L - bondHeld,
    heldForTraders: L,
    bondHeld,
    bondTarget,
  };
}
