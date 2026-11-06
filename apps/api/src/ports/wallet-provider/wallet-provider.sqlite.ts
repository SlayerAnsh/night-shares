import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { transaction } from "../../db/transaction";
import { DomainError } from "../../shared/errors/domain-error";
import { fromUsd } from "../../shared/money";
import type { Clock } from "../clock/clock";
import type { IdGenerator } from "../ids/id-generator";
import type { WalletCustody } from "../wallet-custody/wallet-custody";
import {
  type SettlementLeg,
  SYSTEM_ADDRESSES,
  type WalletProvider,
  type WalletTransaction,
} from "./wallet-provider";

// This is a persistent mock ledger, not an Arc contract adapter.
export function createSqliteWalletProvider({
  db,
  clock,
  ids,
  custody,
}: {
  db: Database;
  clock: Clock;
  ids: IdGenerator;
  custody?: WalletCustody;
}): WalletProvider {
  const seed = db.query("INSERT OR IGNORE INTO wallet_balances VALUES (?, ?)");
  transaction(db, () => {
    for (const address of Object.values(SYSTEM_ADDRESSES))
      seed.run(address, fromUsd(1_000_000_000));
  });
  function balance(address: string): bigint {
    const row = db
      .query<{ balance: bigint }, [string]>(
        "SELECT balance_micros AS balance FROM wallet_balances WHERE address = ?",
      )
      .get(address);
    if (!row) throw new DomainError("NOT_FOUND", "Wallet not found.");
    return row.balance;
  }
  async function ensureSystemWallet(address: string) {
    if (Object.values(SYSTEM_ADDRESSES).some((name) => name === address))
      await custody?.createWallet({ kind: "system", name: address });
  }
  // TODO: Replace this ledger settlement with an atomic Arc USDC transfer adapter
  // once the contracts package deploys. Custody must never send transactions here.
  async function settle(legs: SettlementLeg[]): Promise<string[]> {
    if (custody)
      await Promise.all(
        [...new Set(legs.flatMap((leg) => [leg.from, leg.to]))].map(
          ensureSystemWallet,
        ),
      );
    return transaction(db, () => {
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
      for (const [from, total] of totals) {
        if (balance(from) < total)
          throw new DomainError("FAILED_PRECONDITION", "Not enough USDC.");
      }
      return legs.map(({ from, to, amount, memo }) => {
        db.query(
          "UPDATE wallet_balances SET balance_micros = ? WHERE address = ?",
        ).run(balance(from) - amount, from);
        db.query(
          "UPDATE wallet_balances SET balance_micros = ? WHERE address = ?",
        ).run(balance(to) + amount, to);
        const id = ids.next("tx");
        db.query(
          "INSERT INTO wallet_transactions (id, at, from_address, to_address, amount_micros, memo) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(id, clock.now(), from, to, amount, memo);
        return id;
      });
    });
  }
  return {
    custody,
    async linkWallet(humanId) {
      const legacy = `0x${createHash("sha256").update(humanId).digest("hex").slice(0, 40)}`;
      const existing = db
        .query<{ address: string }, [string]>(
          "SELECT wallet_address AS address FROM identity_users WHERE human_id = ?",
        )
        .get(humanId);
      const legacyExists = db
        .query("SELECT 1 FROM wallet_balances WHERE address = ?")
        .get(legacy);
      const address =
        existing?.address ??
        (legacyExists
          ? legacy
          : custody
            ? (await custody.createWallet({ kind: "user", humanId })).address
            : legacy);
      seed.run(address, fromUsd(12_480));
      return address;
    },
    async balance(address) {
      await ensureSystemWallet(address);
      return balance(address);
    },
    async transactions(address) {
      balance(address);
      return db
        .query<
          Omit<WalletTransaction, "direction" | "at"> & { at: bigint },
          [string]
        >(
          `SELECT id, at, from_address AS "from", to_address AS "to", amount_micros AS amount, memo FROM wallet_transactions WHERE from_address = ?1 OR to_address = ?1 ORDER BY at DESC, sequence DESC`,
        )
        .all(address)
        .map((row) => ({
          ...row,
          at: Number(row.at),
          direction: row.from === address ? "out" : "in",
        }));
    },
    async transfer(from, to, amount, memo) {
      const [id] = await settle([{ from, to, amount, memo }]);
      return id as string;
    },
    settle,
  };
}
