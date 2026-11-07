import { WALK_MULTIPLE } from "./constants";

export function walkPayout({
  paid,
  pending = 0,
  fund = Infinity,
}: {
  paid: number;
  pending?: number;
  fund?: number;
}) {
  const toGuest = WALK_MULTIPLE * paid;
  const fromPending = Math.min(toGuest, Math.max(0, pending));
  const fromFund = Math.min(toGuest - fromPending, Math.max(0, fund));
  const owedToGuest = toGuest - fromPending - fromFund;
  return {
    toGuest,
    fromPending,
    fromFund,
    owedToGuest,
    hostDebt: fromFund + owedToGuest,
  };
}
