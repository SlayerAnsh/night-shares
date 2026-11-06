import { REFUND_AT_FAIR } from "./constants";

export function unsoldRefund(
  ask: number | null | undefined,
  pstar: number,
): number {
  if (ask == null) return 0;
  if (ask <= pstar) return REFUND_AT_FAIR * pstar;
  if (ask >= 2 * pstar) return 0;
  return REFUND_AT_FAIR * pstar * (2 - ask / pstar);
}

export const offlineSaleRefund = (pstar: number): number => pstar;
