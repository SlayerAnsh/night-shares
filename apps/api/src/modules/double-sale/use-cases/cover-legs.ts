import { offlineSaleCover } from "@night-shares/market-model";
import type { SettlementLeg } from "../../../ports/wallet-provider/wallet-provider";
export function coverLegs(
  amount: bigint,
  reserve: bigint,
  pending: bigint,
  to: string,
) {
  // The pure model accepts numbers. Integer micros preserve exact rounding here.
  for (const value of [amount, reserve, pending])
    if (value > BigInt(Number.MAX_SAFE_INTEGER))
      throw new RangeError("Cover exceeds the model's safe integer range.");
  const cover = offlineSaleCover({
    pstar: Number(amount),
    reserveSlice: Number(reserve),
    pending: Number(pending),
  });
  const legs: SettlementLeg[] = [
    {
      from: "pool",
      to,
      amount: BigInt(cover.fromReserve),
      memo: "double_sale_refund: reserve",
    },
    {
      from: "pool",
      to,
      amount: BigInt(cover.fromPending),
      memo: "double_sale_refund: pending",
    },
    {
      from: "cover_fund",
      to,
      amount: BigInt(cover.fromFund),
      memo: "double_sale_refund: cover",
    },
    {
      from: "pool",
      to: "cover_fund",
      amount: BigInt(cover.penaltyFromPending),
      memo: "double sale penalty",
    },
  ];
  return {
    legs: legs.filter((leg) => leg.amount > 0n),
    reserve: BigInt(cover.fromReserve),
    pending: BigInt(cover.fromPending + cover.penaltyFromPending),
    debt: BigInt(cover.hostDebt),
  };
}
