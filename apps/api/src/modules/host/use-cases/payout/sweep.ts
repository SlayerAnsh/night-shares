import { transaction } from "../../../../db/transaction";
import { SYSTEM_ADDRESSES } from "../../../../ports/wallet-provider/wallet-provider";
import {
  adjustCoverAccount,
  coverAccount,
} from "../../../walk/repo/cover-accounts";
import { snapshotSweep } from "../../../walk/repo/night-pending";
import { finishOwed, reserveOwed } from "../../../walk/repo/owed";
import type { HostDeps } from "../deps";
import { createGetPayout } from "./get-payout";

export function createSweep(deps: HostDeps) {
  const { ports, repo } = deps;
  return async (userId: string, propertyId: string, walletAddress: string) => {
    const reserved = transaction(ports.db, () => {
      if (
        ports.db
          .query("SELECT 1 FROM walk_claim_locks WHERE property_id = ?")
          .get(propertyId)
      )
        return;
      if (
        ports.db
          .query(
            `SELECT 1 FROM market_settlements s JOIN inventory i ON i.night_key = s.night_key WHERE i.property_id = ?`,
          )
          .get(propertyId)
      )
        return;
      if (
        ports.db
          .query(
            "SELECT 1 FROM host_sweeps WHERE property_id = ? AND status = 'pending'",
          )
          .get(propertyId) ||
        ports.db
          .query(
            "SELECT 1 FROM walk_reports WHERE property_id = ? AND status = 'pending'",
          )
          .get(propertyId)
      )
        return;
      const gross = createGetPayout(deps, false)(userId, propertyId)
        .availableNow.micros;
      if (gross === 0n) return;
      const owed = reserveOwed(ports.db, propertyId, gross);
      const remaining = gross - owed.amount;
      const outstanding = coverAccount(ports.db, propertyId).debt;
      let debt = outstanding;
      if (debt > remaining) debt = remaining;
      const amount = remaining - debt;
      const id = ports.ids.next("sweep");
      adjustCoverAccount(ports.db, propertyId, debt + owed.amount, -debt);
      repo.addWithdrawal(propertyId, amount);
      ports.db
        .query(
          "INSERT INTO host_sweeps (id, property_id, amount, debt, at, status) VALUES (?, ?, ?, ?, ?, 'pending')",
        )
        .run(id, propertyId, amount, debt, ports.clock.now());
      snapshotSweep(ports, propertyId, id);
      return { id, amount, debt, owed };
    });
    if (!reserved) return;
    const { id, amount, debt, owed } = reserved;
    let ids: string[];
    try {
      ids = await ports.walletProvider.settle(
        [
          ...owed.legs,
          {
            from: SYSTEM_ADDRESSES.pool,
            to: walletAddress,
            amount,
            memo: `withdrawal:${id}`,
          },
          {
            from: SYSTEM_ADDRESSES.pool,
            to: SYSTEM_ADDRESSES.coverFund,
            amount: debt,
            memo: `withdrawal:debt:${id}`,
          },
        ].filter((leg) => leg.amount > 0n),
      );
    } catch (error) {
      transaction(ports.db, () => {
        finishOwed(ports.db, owed, true);
        repo.addWithdrawal(propertyId, -amount);
        adjustCoverAccount(ports.db, propertyId, -debt - owed.amount, debt);
        ports.db.query("DELETE FROM host_sweeps WHERE id = ?").run(id);
      });
      throw error;
    }
    transaction(ports.db, () => {
      finishOwed(ports.db, owed);
      ports.db
        .query(
          "UPDATE host_sweeps SET status = 'settled', transaction_id = ? WHERE id = ?",
        )
        .run(ids[0] ?? "", id);
    });
    return reserved;
  };
}
