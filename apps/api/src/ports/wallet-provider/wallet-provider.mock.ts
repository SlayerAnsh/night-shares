import { createHash } from "node:crypto";
import { DomainError } from "../../shared/errors/domain-error";
import { fromUsd } from "../../shared/money";
import type { IdGenerator } from "../ids/id-generator";
import { SYSTEM_ADDRESSES, type WalletProvider } from "./wallet-provider";
export type MockWalletProvider = WalletProvider & {
  credit(address: string, amount: bigint): void;
};
export function createMockWalletProvider({
  ids,
}: {
  ids: IdGenerator;
}): MockWalletProvider {
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
    async transfer(from, to, amount, _memo) {
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
      credit(to, amount);
      return ids.next("tx");
    },
    credit,
  };
}
