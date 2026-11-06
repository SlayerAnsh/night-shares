import { createHash } from "node:crypto";
import { DomainError } from "../../shared/errors/domain-error";
import { fromUsd } from "../../shared/money";
import type { Clock } from "../clock/clock";
import type { IdGenerator } from "../ids/id-generator";
import {
  SYSTEM_ADDRESSES,
  type WalletProvider,
  type WalletTransaction,
} from "./wallet-provider";
export type MockWalletProvider = WalletProvider & {
  credit(address: string, amount: bigint): void;
};
export function createMockWalletProvider({
  ids,
  clock,
}: {
  ids: IdGenerator;
  clock: Clock;
}): MockWalletProvider {
  const history: Omit<WalletTransaction, "direction">[] = [];
  const balances = new Map<string, bigint>(
    Object.values(SYSTEM_ADDRESSES).map((address) => [
      address,
      fromUsd(1_000_000_000),
    ]),
  );
  function balance(address: string) {
    const value = balances.get(address);
    if (value === undefined)
      throw new DomainError("NOT_FOUND", "Wallet not found.");
    return value;
  }
  function credit(address: string, amount: bigint) {
    if (amount < 0n)
      throw new DomainError("INVALID_ARGUMENT", "Amount cannot be negative.");
    balances.set(address, balance(address) + amount);
    history.push({
      id: ids.next("tx"),
      at: clock.now(),
      from: "onramp",
      to: address,
      amount,
      memo: "onramp",
    });
  }
  return {
    async linkWallet(humanId) {
      const address = `0x${createHash("sha256").update(humanId).digest("hex").slice(0, 40)}`;
      if (!balances.has(address)) balances.set(address, fromUsd(12_480));
      return address;
    },
    async balance(address) {
      return balance(address);
    },
    async transactions(address) {
      balance(address);
      return history
        .slice()
        .reverse()
        .filter((tx) => tx.from === address || tx.to === address)
        .sort((a, b) => b.at - a.at)
        .map((tx) => ({
          ...tx,
          direction: tx.from === address ? "out" : "in",
        }));
    },
    async transfer(from, to, amount, memo) {
      if (amount <= 0n)
        throw new DomainError(
          "INVALID_ARGUMENT",
          "Transfer amount must be positive.",
        );
      const available = balance(from);
      balance(to);
      if (available < amount)
        throw new DomainError(
          "RESOURCE_EXHAUSTED",
          "Insufficient USDC balance.",
        );
      balances.set(from, available - amount);
      balances.set(to, balance(to) + amount);
      const id = ids.next("tx");
      history.push({ id, at: clock.now(), from, to, amount, memo });
      return id;
    },
    credit,
  };
}
