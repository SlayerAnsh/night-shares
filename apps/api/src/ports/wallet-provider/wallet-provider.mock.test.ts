import { expect, test } from "bun:test";
import { fromUsd } from "../../shared/money";
import { createMockClock } from "../clock/clock.mock";
import { createMockIdGenerator } from "../ids/id-generator.mock";
import { createMockOnramp } from "../onramp/onramp.mock";
import { createMockWalletProvider } from "./wallet-provider.mock";

test("wallet linking is stable and card charges credit the same transfer balance", async () => {
  const ids = createMockIdGenerator();
  const wallet = createMockWalletProvider({
    ids,
    clock: createMockClock(1000),
  });
  const address = await wallet.linkWallet("alice");
  expect(await wallet.linkWallet("alice")).toBe(address);
  expect(await wallet.balance(address)).toBe(fromUsd(12_480));
  const onramp = createMockOnramp({ ids, wallet });
  await onramp.chargeCard({ amount: fromUsd(20), address });
  await wallet.transfer(address, "pool", fromUsd(10), "buy");
  expect(await wallet.balance(address)).toBe(fromUsd(12_490));
  await expect(
    wallet.transfer(address, "host", fromUsd(50_000), "buy"),
  ).rejects.toThrow("Insufficient");
  await expect(wallet.transfer(address, "missing", 1n, "buy")).rejects.toThrow(
    "Wallet not found",
  );
  expect(await wallet.balance(address)).toBe(fromUsd(12_490));
});

test("wallet history records credits and both transfer directions with isolated copies", async () => {
  const ids = createMockIdGenerator();
  const clock = createMockClock(1000);
  const wallet = createMockWalletProvider({ ids, clock });
  const alice = await wallet.linkWallet("alice");
  const bob = await wallet.linkWallet("bob");
  const onramp = createMockOnramp({ ids, wallet });
  expect(await wallet.transactions(alice)).toEqual([]);
  await onramp.chargeCard({ amount: 20n, address: alice });
  clock.advance(100);
  const id = await wallet.transfer(alice, bob, 10n, "buy");
  const transfer = {
    id,
    at: 1100,
    from: alice,
    to: bob,
    amount: 10n,
    memo: "buy",
  };
  expect(await wallet.transactions(alice)).toEqual([
    { ...transfer, direction: "out" },
    {
      id: "tx_0001",
      at: 1000,
      from: "onramp",
      to: alice,
      amount: 20n,
      memo: "onramp",
      direction: "in",
    },
  ]);
  expect(await wallet.transactions(bob)).toEqual([
    { ...transfer, direction: "in" },
  ]);
  const history = await wallet.transactions(alice);
  const first = history[0];
  if (first) first.memo = "changed";
  expect((await wallet.transactions(alice))[0]?.memo).toBe("buy");
  await expect(wallet.transfer(alice, bob, 0n, "invalid")).rejects.toThrow();
  await expect(
    wallet.transfer(alice, bob, fromUsd(50_000), "invalid"),
  ).rejects.toThrow();
  await expect(
    onramp.chargeCard({ amount: 0n, address: alice }),
  ).rejects.toThrow();
  expect(await wallet.transactions(alice)).toHaveLength(2);
  const selfId = await wallet.transfer(alice, alice, 1n, "self");
  expect((await wallet.transactions(alice))[0]?.id).toBe(selfId);
  expect(await wallet.balance(alice)).toBe(fromUsd(12_480) + 10n);
});
