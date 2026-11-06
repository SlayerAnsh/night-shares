import { expect, test } from "bun:test";
import { fromUsd } from "../../shared/money";
import { createMockClock } from "../clock/clock.mock";
import { createMockIdGenerator } from "../ids/id-generator.mock";
import { createMockWalletProvider } from "./wallet-provider.mock";

test("wallet linking is stable and transfers debit the balance", async () => {
  const ids = createMockIdGenerator();
  const wallet = createMockWalletProvider({
    ids,
    clock: createMockClock(1000),
  });
  const address = await wallet.linkWallet("alice");
  expect(await wallet.linkWallet("alice")).toBe(address);
  expect(await wallet.balance(address)).toBe(fromUsd(12_480));
  await wallet.transfer("treasury", address, fromUsd(20), "fund");
  await wallet.transfer(address, "pool", fromUsd(10), "buy");
  expect(await wallet.balance(address)).toBe(fromUsd(12_490));
  await expect(
    wallet.transfer(address, "host", fromUsd(50_000), "buy"),
  ).rejects.toThrow("Not enough USDC.");
  await expect(wallet.transfer(address, "missing", 1n, "buy")).rejects.toThrow(
    "Wallet not found",
  );
  expect(await wallet.balance(address)).toBe(fromUsd(12_490));
});

test("wallet history records both transfer directions with isolated copies", async () => {
  const ids = createMockIdGenerator();
  const clock = createMockClock(1000);
  const wallet = createMockWalletProvider({ ids, clock });
  const alice = await wallet.linkWallet("alice");
  const bob = await wallet.linkWallet("bob");
  expect(await wallet.transactions(alice)).toEqual([]);
  await wallet.transfer("treasury", alice, 20n, "fund");
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
      from: "treasury",
      to: alice,
      amount: 20n,
      memo: "fund",
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
    wallet.transfer("treasury", alice, 0n, "invalid"),
  ).rejects.toThrow();
  expect(await wallet.transactions(alice)).toHaveLength(2);
  const selfId = await wallet.transfer(alice, alice, 1n, "self");
  expect((await wallet.transactions(alice))[0]?.id).toBe(selfId);
  expect(await wallet.balance(alice)).toBe(fromUsd(12_480) + 10n);
});

test("settlement aggregates debits and rejects every leg without ledger changes", async () => {
  const wallet = createMockWalletProvider({
    ids: createMockIdGenerator(),
    clock: createMockClock(0),
  });
  const from = await wallet.linkWallet("batch");
  const before = await wallet.balance(from);
  const pool = await wallet.balance("pool");
  await expect(
    wallet.settle([
      { from, to: "pool", amount: before, memo: "first" },
      { from, to: "treasury", amount: 1n, memo: "second" },
    ]),
  ).rejects.toMatchObject({
    code: "FAILED_PRECONDITION",
    message: "Not enough USDC.",
  });
  expect(await wallet.balance(from)).toBe(before);
  expect(await wallet.balance("pool")).toBe(pool);
  expect(await wallet.transactions(from)).toEqual([]);
});
