import { expect, test } from "bun:test";
import { createMockClock } from "../../../ports/clock/clock.mock";
import { createMockIdGenerator } from "../../../ports/ids/id-generator.mock";
import { createMockWalletProvider } from "../../../ports/wallet-provider/wallet-provider.mock";
import { createListTransactions } from "./list-transactions";

test("returns only the signed-in wallet ledger with directions and memos", async () => {
  const walletProvider = createMockWalletProvider({
    clock: createMockClock(0),
    ids: createMockIdGenerator(),
  });
  const walletAddress = await walletProvider.linkWallet("alice");
  const bob = await walletProvider.linkWallet("bob");
  await walletProvider.transfer(walletAddress, bob, 7n, "buy");
  await walletProvider.transfer(bob, "pool", 3n, "unrelated");
  const entries = await createListTransactions({ walletProvider })({
    id: "usr",
    humanId: "alice",
    level: "device",
    walletAddress,
  });
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    direction: "out",
    memo: "buy",
    amount: 7n,
  });
});
