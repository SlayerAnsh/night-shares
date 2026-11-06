import type { Database } from "bun:sqlite";
import { transaction } from "../../db/transaction";
import { DomainError } from "../../shared/errors/domain-error";
import type { Clock } from "../clock/clock";
import type { IdGenerator } from "../ids/id-generator";
import type { SettlementLeg } from "../wallet-provider/wallet-provider";
// The current mock ledger can commit with approval. A remote wallet needs an outbox and reconciliation.
export function checkpointLedger({
  db,
  clock,
  ids,
}: {
  db: Database;
  clock: Clock;
  ids: IdGenerator;
}) {
  function balance(address: string) {
    const row = db
      .query<{ balance: bigint }, [string]>(
        "SELECT balance_micros AS balance FROM wallet_balances WHERE address = ?",
      )
      .get(address);
    if (!row) throw new DomainError("NOT_FOUND", "Wallet not found.");
    return row.balance;
  }
  return {
    balance,
    settle(legs: SettlementLeg[]) {
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
        for (const [from, total] of totals)
          if (balance(from) < total)
            throw new DomainError("FAILED_PRECONDITION", "Not enough USDC.");
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
    },
  };
}
