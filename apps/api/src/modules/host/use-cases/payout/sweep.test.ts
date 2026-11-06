import { expect, test } from "bun:test";
import { TransactionKind } from "@night-shares/proto/wallet/v1/transaction_pb";
import { toTransaction } from "../../../wallet/mappers/transaction";
import { fixture } from "../fixture";
import { createSweep } from "./sweep";

test("concurrent ticks reserve once and repeated ticks produce no duplicate payout", async () => {
  const f = fixture();
  const address = await f.ports.walletProvider.linkWallet("host");
  const before = await f.ports.walletProvider.balance(address);
  const available = f.use.getPayout(f.userId, "prop_velana").availableNow
    .micros;
  const sweep = createSweep(f);
  const results = await Promise.all([
    sweep(f.userId, "prop_velana", address),
    sweep(f.userId, "prop_velana", address),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(await sweep(f.userId, "prop_velana", address)).toBeUndefined();
  expect(await f.ports.walletProvider.balance(address)).toBe(
    before + available,
  );
  const transactions = await f.ports.walletProvider.transactions(address);
  expect(transactions).toHaveLength(1);
  const first = transactions[0];
  if (!first) throw new Error("Missing sweep transaction");
  expect(toTransaction(first).kind).toBe(TransactionKind.WITHDRAWAL);
  const payout = f.use.getPayout(f.userId, "prop_velana");
  expect(payout.sweptTotal.micros).toBe(available);
  expect(payout.lastSweepAmount.micros).toBe(available);
  expect(payout.lastSweepTransactionId).toBe(first.id);
});
