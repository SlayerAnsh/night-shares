import type { Database } from "bun:sqlite";
import { transaction } from "../../../db/transaction";
import type { User } from "../../../ports/sessions/session-store";
import { DomainError } from "../../../shared/errors/domain-error";

type Budget = {
  address: string;
  total: bigint;
  per_order: bigint;
  spent: bigint;
  allowed: string;
};
export function agentWallets(db: Database) {
  function get(user: User): Budget {
    return transaction(db, () => {
      const address = `agent:${user.walletAddress}`;
      // Agent addresses never receive the mock user's initial balance.
      db.query("INSERT OR IGNORE INTO wallet_balances VALUES (?, 0)").run(
        address,
      );
      db.query(
        "INSERT OR IGNORE INTO market_agent_wallets (human_id, address) VALUES (?, ?)",
      ).run(user.humanId, address);
      const budget = db
        .query<Budget, [string]>(
          "SELECT * FROM market_agent_wallets WHERE human_id = ?",
        )
        .get(user.humanId);
      if (!budget)
        throw new DomainError("NOT_FOUND", "Agent wallet not found.");
      return budget;
    });
  }
  function check(user: User, key: string, amount: bigint) {
    const b = get(user);
    const allowed: string[] = JSON.parse(b.allowed);
    if (amount > b.per_order || amount > b.total - b.spent)
      throw new DomainError(
        "FAILED_PRECONDITION",
        "Order exceeds agent budget.",
      );
    if (allowed.length && !allowed.includes(key))
      throw new DomainError(
        "FAILED_PRECONDITION",
        "Night is not allowed by the agent budget.",
      );
  }
  return {
    get,
    check,
    reserve(user: User, key: string, amount: bigint) {
      check(user, key, amount);
      db.query(
        "UPDATE market_agent_wallets SET spent = spent + ? WHERE human_id = ?",
      ).run(amount, user.humanId);
    },
    compensate(user: User, amount: bigint) {
      db.query(
        "UPDATE market_agent_wallets SET spent = spent - ? WHERE human_id = ?",
      ).run(amount, user.humanId);
    },
    set(user: User, total: bigint, perOrder: bigint, allowed: string[]) {
      return transaction(db, () => {
        const current = get(user);
        if (
          total < 0n ||
          perOrder < 0n ||
          total > 9223372036854775807n ||
          perOrder > 9223372036854775807n
        )
          throw new DomainError(
            "INVALID_ARGUMENT",
            "Budget must fit nonnegative micro USDC.",
          );
        if (total < current.spent)
          throw new DomainError(
            "FAILED_PRECONDITION",
            "Budget cannot be below spent USDC.",
          );
        db.query(
          "UPDATE market_agent_wallets SET total = ?, per_order = ?, allowed = ? WHERE human_id = ?",
        ).run(total, perOrder, JSON.stringify(allowed), user.humanId);
      });
    },
  };
}
