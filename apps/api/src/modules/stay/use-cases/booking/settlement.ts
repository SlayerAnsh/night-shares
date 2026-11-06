import {
  askFillProceeds,
  type BuyResult,
  toMicros,
} from "@night-shares/market-model";
import { SYSTEM_ADDRESSES } from "../../../../ports/wallet-provider/wallet-provider";
import { feePayments } from "../../../../shared/fee-payments";
export function settlement(route: BuyResult) {
  const payments: { to: string; amount: bigint }[] = [];
  for (const fill of route.fills) {
    const gross = toMicros(askFillProceeds(fill.price, fill.take).gross);
    if (fill.src === "trader") {
      const to =
        !fill.who || fill.who === "mm-bot"
          ? SYSTEM_ADDRESSES.marketMaker
          : fill.who;
      const fee = toMicros(fill.sellerFee ?? 0);
      payments.push(
        { to, amount: toMicros(fill.sellerNet ?? 0) },
        ...feePayments(gross, fee),
      );
    } else payments.push({ to: "pool", amount: gross });
  }
  // Reconcile sub-micro rounding to the route total so debits exactly match receipts.
  const fee =
    toMicros(route.total) - payments.reduce((sum, p) => sum + p.amount, 0n);
  payments.push(...feePayments(toMicros(route.gross), fee));
  return payments.filter((p) => p.amount > 0n);
}
