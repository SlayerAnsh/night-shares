import { REFUND_AT_FAIR } from "./constants";

/** @deprecated Use cutoffRefund instead of the parked ask refund rule. */
export function unsoldRefund(
  ask: number | null | undefined,
  pstar: number,
): number {
  if (ask == null) return 0;
  if (ask <= pstar) return REFUND_AT_FAIR * pstar;
  if (ask >= 2 * pstar) return 0;
  return REFUND_AT_FAIR * pstar * (2 - ask / pstar);
}

// For a double sale reported by the API attester, the holder gets the pool bid; pass that bid as pstar.
export const offlineSaleRefund = (pstar: number): number => pstar;
