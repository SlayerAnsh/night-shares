import { afterEach, expect, test } from "bun:test";
import { Code } from "@connectrpc/connect";
import { TransactionKind } from "@night-shares/proto/wallet/v1/transaction_pb";
import { createHarness } from "./harness";

let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

test("wallet balance and ledger preserve micros, direction, memos and user isolation", async () => {
  const h = await createHarness();
  harness = h;
  const alice = await h.signInAs("device", "alice"),
    bob = await h.signInAs("device", "bob");
  expect((await alice.clients.wallet.getBalance({})).balance?.micros).toBe(
    12480000000n,
  );
  expect(
    (await alice.clients.wallet.listTransactions({})).transactions,
  ).toEqual([]);
  const id = await h.container.ports.walletProvider.transfer(
    alice.user.walletAddress,
    bob.user.walletAddress,
    1234567n,
    "buy",
  );
  const outgoing = (await alice.clients.wallet.listTransactions({}))
    .transactions;
  const incoming = (await bob.clients.wallet.listTransactions({})).transactions;
  expect(outgoing).toHaveLength(1);
  expect(outgoing[0]).toMatchObject({
    id,
    kind: TransactionKind.BUY,
    amount: { micros: -1234567n },
    reference: id,
    description: "buy",
  });
  expect(incoming[0]?.amount?.micros).toBe(1234567n);
  expect((await alice.clients.wallet.getBalance({})).balance?.micros).toBe(
    12478765433n,
  );
});

test("wallet endpoints require authentication", async () => {
  const h = await createHarness();
  harness = h;
  await expect(h.clients.wallet.getBalance({})).rejects.toMatchObject({
    code: Code.Unauthenticated,
  });
  await expect(h.clients.wallet.listTransactions({})).rejects.toMatchObject({
    code: Code.Unauthenticated,
  });
});
