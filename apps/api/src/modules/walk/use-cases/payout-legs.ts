import { WALK_MULTIPLE } from "@night-shares/market-model";
import type { SettlementLeg } from "../../../ports/wallet-provider/wallet-provider";

export function payoutLegs(
  paid: bigint,
  pending: bigint,
  to: string,
  fund: bigint = paid * BigInt(WALK_MULTIPLE),
) {
  if (paid < 0n) throw new RangeError("Walk paid amount must be nonnegative.");
  const toGuest = paid * BigInt(WALK_MULTIPLE);
  const fromPending =
    pending <= 0n ? 0n : pending < toGuest ? pending : toGuest;
  const remaining = toGuest - fromPending;
  const fromFund = fund <= 0n ? 0n : fund < remaining ? fund : remaining;
  const owedToGuest = remaining - fromFund;
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
    debt: fromFund,
    owedToGuest,
    toGuest,
    legs: legs.filter((leg) => leg.amount > 0n),
  };
}
