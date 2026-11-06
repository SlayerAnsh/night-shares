import { WALK_MULTIPLE } from "./constants";

export function walkPayout({
  paid,
  pending = 0,
}: {
  paid: number;
  pending?: number;
}) {
  const toGuest = WALK_MULTIPLE * paid;
  const fromPending = Math.min(toGuest, Math.max(0, pending));
  const fromFund = toGuest - fromPending;
  return { toGuest, fromPending, fromFund, hostDebt: fromFund };
}
