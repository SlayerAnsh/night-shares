import {
  askFillProceeds,
  type BuyResult,
  toMicros,
} from "@night-shares/market-model";
import type { Ports } from "../../../../container/ports";
import { SYSTEM_ADDRESSES } from "../../../../ports/wallet-provider/wallet-provider";
import { feePayments } from "../../../../shared/fee-payments";
import { tradeFeePayments } from "../../../market/use-cases/trading/host-fees";
export function settlement(
  route: BuyResult,
  context?: {
    ports: Ports;
    propertyId: string;
    buyer: string;
    recallPayments: { to: string; amount: bigint }[];
  },
) {
  const payments: { to: string; amount: bigint }[] = [
    ...(context?.recallPayments ?? []),
  ];
  const fees = (gross: bigint, fee: bigint, trader: string) =>
    context
      ? tradeFeePayments(context.ports, context.propertyId, trader, gross, fee)
      : feePayments(gross, fee);
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
        ...fees(gross, fee, to),
      );
    } else if (fill.src !== "recall" || !context)
      payments.push({ to: "pool", amount: gross });
  }
  // Reconcile sub-micro rounding to the route total so debits exactly match receipts.
  const fee =
    toMicros(route.total) - payments.reduce((sum, p) => sum + p.amount, 0n);
  payments.push(...fees(toMicros(route.gross), fee, context?.buyer ?? ""));
  return payments.filter((p) => p.amount > 0n);
}
