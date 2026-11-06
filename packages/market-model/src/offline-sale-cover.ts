export function offlineSaleCover({
  pstar,
  reserveSlice = 0,
  pending = 0,
}: {
  pstar: number;
  reserveSlice?: number;
  pending?: number;
}) {
  const fromReserve = Math.min(pstar, Math.max(0, reserveSlice));
  const fromPending = Math.min(pstar - fromReserve, Math.max(0, pending));
  const fromFund = pstar - fromReserve - fromPending;
  const penaltyFromPending = Math.min(
    pstar,
    Math.max(0, pending) - fromPending,
  );
  const hostDebt = fromFund + (pstar - penaltyFromPending);
  return {
    toHolder: pstar,
    fromReserve,
    fromPending,
    fromFund,
    penalty: pstar,
    penaltyFromPending,
    hostDebt,
    hostTotal: 2 * pstar,
  };
}
