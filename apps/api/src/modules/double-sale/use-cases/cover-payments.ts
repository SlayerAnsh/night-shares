import type { SettlementLeg } from "../../../ports/wallet-provider/wallet-provider";
import { coverLegs } from "./cover-legs";
export function coverPayments(
  payments: { amount: bigint; to: string }[],
  reserve: bigint,
  pending: bigint,
) {
  const cover = coverLegs(
    payments.reduce((sum, payment) => sum + payment.amount, 0n),
    reserve,
    pending,
    "holders",
  );
  const sources = cover.legs
    .filter((leg) => leg.to === "holders")
    .map((leg) => ({ ...leg }));
  const legs: SettlementLeg[] = [];
  for (const payment of payments) {
    let remaining = payment.amount;
    for (const source of sources) {
      let amount = source.amount;
      if (amount > remaining) amount = remaining;
      if (amount > 0n) legs.push({ ...source, to: payment.to, amount });
      source.amount -= amount;
      remaining -= amount;
    }
  }
  legs.push(...cover.legs.filter((leg) => leg.to === "cover_fund"));
  return { ...cover, legs };
}
