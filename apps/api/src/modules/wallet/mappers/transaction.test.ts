import { expect, test } from "bun:test";
import { timestampMs } from "@bufbuild/protobuf/wkt";
import { TransactionKind } from "@night-shares/proto/wallet/v1/transaction_pb";
import { toTransaction } from "./transaction";

test("maps outgoing micros, memo kind, reference and exact timestamp", () => {
  const result = toTransaction({
    id: "tx_1",
    from: "alice",
    to: "pool",
    amount: 1234567n,
    at: 1234,
    direction: "out",
    memo: "buy:ord_1",
  });
  expect(result.amount.micros).toBe(-1234567n);
  expect(result.kind).toBe(TransactionKind.BUY);
  expect(result.description).toBe("buy:ord_1");
  expect(result.reference).toBe("tx_1");
  expect(timestampMs(result.at)).toBe(1234);
});
test("maps incoming deposits and preserves unknown memos", () => {
  const tx = {
    id: "tx_2",
    from: "treasury",
    to: "alice",
    amount: 1n,
    at: 0,
    direction: "in" as const,
    memo: "deposit",
  };
  expect(toTransaction(tx)).toMatchObject({
    kind: TransactionKind.DEPOSIT,
    amount: { micros: 1n },
  });
  expect(toTransaction({ ...tx, memo: "custom" })).toMatchObject({
    kind: TransactionKind.UNSPECIFIED,
    description: "custom",
  });
});
