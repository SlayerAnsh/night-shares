import { WALK_MULTIPLE, walkPayout } from "@night-shares/market-model";
import type { SettlementLeg } from "../../../ports/wallet-provider/wallet-provider";

export function payoutLegs(paid: bigint, pending: bigint, to: string) {
  // The numeric model operates on integer micros within its exact range.
  if (
    paid < 0n ||
    paid * BigInt(WALK_MULTIPLE) > BigInt(Number.MAX_SAFE_INTEGER) ||
    pending > BigInt(Number.MAX_SAFE_INTEGER)
  )
    throw new RangeError("Walk payout exceeds the model's safe integer range.");
  const payout = walkPayout({ paid: Number(paid), pending: Number(pending) });
  const fromPending = BigInt(payout.fromPending);
  const fromFund = BigInt(payout.fromFund);
  const legs: SettlementLeg[] = [
    {
      from: "pool",
      to,
      amount: fromPending,
      memo: "double_sale_refund: pending",
    },
    {
      from: "cover_fund",
      to,
      amount: fromFund,
      memo: "double_sale_refund: cover",
    },
  ];
  return {
    fromPending,
    fromFund,
    debt: BigInt(payout.hostDebt),
    toGuest: BigInt(payout.toGuest),
    legs: legs.filter((leg) => leg.amount > 0n),
  };
}
