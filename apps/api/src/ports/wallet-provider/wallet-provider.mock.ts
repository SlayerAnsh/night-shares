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
export function createMockWalletProvider({
  ids,
  clock,
}: {
  ids: IdGenerator;
  clock: Clock;
}): WalletProvider {
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
  // A real Arc adapter maps this batch to one multi-transfer transaction.
  async function settle(legs: Parameters<WalletProvider["settle"]>[0]) {
    const totals = new Map<string, bigint>();
    for (const leg of legs) {
      if (leg.amount <= 0n)
        throw new DomainError(
          "INVALID_ARGUMENT",
          "Transfer amount must be positive.",
        );
      balance(leg.from);
      balance(leg.to);
      totals.set(leg.from, (totals.get(leg.from) ?? 0n) + leg.amount);
    }
    for (const [from, total] of totals)
      if (balance(from) < total)
        throw new DomainError("FAILED_PRECONDITION", "Not enough USDC.");
    // No await may separate validation and mutation in this in-memory adapter.
    return legs.map(({ from, to, amount, memo }) => {
      balances.set(from, balance(from) - amount);
      balances.set(to, balance(to) + amount);
      const id = ids.next("tx");
      history.push({ id, at: clock.now(), from, to, amount, memo });
      return id;
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
      const [id] = await settle([{ from, to, amount, memo }]);
      return id as string;
    },
    settle,
  };
}
