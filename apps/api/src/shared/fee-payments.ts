import { COVER_FUND, FEE, toMicros } from "@night-shares/market-model";
import { SYSTEM_ADDRESSES } from "../ports/wallet-provider/wallet-provider";

export function feePayments(notional: bigint, fee: bigint, late = false) {
  // Round the fund allocation to micros and subtract it from the existing fee.
  const share = (notional * toMicros(COVER_FUND) + 500000n) / 1000000n;
  // Never more than the fee itself, so the treasury leg is never negative.
  const cover = share < fee ? share : fee;
  const base = (notional * toMicros(FEE) + 500000n) / 1000000n;
  const excess = late && fee > base ? fee - base : 0n;
  return [
    { to: SYSTEM_ADDRESSES.coverFund, amount: cover },
    { to: SYSTEM_ADDRESSES.treasury, amount: fee - cover - excess },
    ...(excess > 0n
      ? [{ to: SYSTEM_ADDRESSES.rebatePool, amount: excess }]
      : []),
  ];
}
