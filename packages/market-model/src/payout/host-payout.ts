import { cost } from "../curve";

export interface PayoutInput {
  F: number;
  k: number;
  S: number;
  q: number;
  held: number;
  cutoffPaid?: number;
}
export function hostPayout(st: PayoutInput) {
  const R = cost(st.F, st.k, st.S, 0, st.q),
    L = cost(st.F, st.k, st.S, st.q - st.held, st.q);
  return {
    gross: R - (st.cutoffPaid ?? 0),
    availableNow: R - L - (st.cutoffPaid ?? 0),
    heldForTraders: L,
  };
}
