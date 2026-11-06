import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import { TransactionKind } from "@night-shares/proto/wallet/v1/transaction_pb";
import type { WalletTransaction } from "../../../ports/wallet-provider/wallet-provider";

const kinds: Record<string, TransactionKind> = {
  rebate: TransactionKind.REBATE,
  double_sale_refund: TransactionKind.DOUBLE_SALE_REFUND,
  agent_funding: TransactionKind.AGENT_FUNDING,
  booking: TransactionKind.BOOKING,
  buy: TransactionKind.BUY,
  sell: TransactionKind.SELL,
  refund: TransactionKind.REFUND,
  withdrawal: TransactionKind.WITHDRAWAL,
  withdraw: TransactionKind.WITHDRAWAL,
  fee: TransactionKind.FEE,
  deposit: TransactionKind.DEPOSIT,
};
export function toTransaction(tx: WalletTransaction) {
  // The contract represents direction with the sign of the amount.
  return {
    id: tx.id,
    kind: kinds[tx.memo.split(":")[0] ?? ""] ?? TransactionKind.UNSPECIFIED,
    amount: { micros: tx.direction === "out" ? -tx.amount : tx.amount },
    at: timestampFromMs(tx.at),
    reference: tx.id,
    description: tx.memo,
  };
}
