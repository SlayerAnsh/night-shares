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
  return {
    gross: R,
    availableNow: R - L,
    heldForTraders: L,
  };
}
