import { COVER_FUND, toMicros } from "@night-shares/market-model";
import { SYSTEM_ADDRESSES } from "../ports/wallet-provider/wallet-provider";

export function feePayments(notional: bigint, fee: bigint) {
  // Round the fund allocation to micros and subtract it from the existing fee.
  const share = (notional * toMicros(COVER_FUND) + 500000n) / 1000000n;
  // Never more than the fee itself, so the treasury leg is never negative.
  const cover = share < fee ? share : fee;
  return [
    { to: SYSTEM_ADDRESSES.coverFund, amount: cover },
    { to: SYSTEM_ADDRESSES.treasury, amount: fee - cover },
  ];
}
