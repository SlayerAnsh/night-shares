import { transaction } from "../db/transaction";
import type { ClaimRow } from "../modules/market/repo/cutoff-claims";
import { type Deps, realise } from "../modules/market/use-cases/context";
import type { User } from "../ports/sessions/session-store";
import { SYSTEM_ADDRESSES } from "../ports/wallet-provider/wallet-provider";

export async function pushCutoff(deps: Deps) {
  const nights = deps.ports.db
    .query<{ night_key: string }, []>(
      "SELECT DISTINCT night_key FROM market_cutoff_claims WHERE ready = 1 AND busy = 0 AND claimed_at IS NULL",
    )
    .all();
  const errors: unknown[] = [];
  for (const night of nights) {
    try {
      await pushNight(deps, night.night_key);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) throw new AggregateError(errors, "Cutoff pushes failed.");
}
async function pushNight({ ports, repo }: Deps, key: string) {
  const rows = transaction(ports.db, () => {
    const rows = ports.db
      .query<ClaimRow & Pick<User, "id" | "walletAddress">, [string]>(
        `SELECT c.*, h.id, h.wallet_address AS walletAddress FROM market_cutoff_claims c
       JOIN market_holders h ON h.human_id = c.human_id
       WHERE c.night_key = ? AND c.ready = 1 AND c.busy = 0 AND c.claimed_at IS NULL
       ORDER BY c.human_id LIMIT 100`,
      )
      .all(key);
    for (const row of rows)
      ports.db
        .query(
          "UPDATE market_cutoff_claims SET busy = 1, claimed_at = ? WHERE night_key = ? AND human_id = ?",
        )
        .run(ports.clock.now(), key, row.human_id);
    return rows;
  });
  if (!rows.length) return;
  try {
    await ports.walletProvider.settle(
      rows
        .filter((r) => r.amount > 0n)
        .map((row) => ({
          from: SYSTEM_ADDRESSES.cutoffClaims,
          to: row.walletAddress,
          amount: row.amount,
          memo: "cutoff push",
        })),
    );
  } catch (error) {
    transaction(ports.db, () => {
      for (const row of rows)
        ports.db
          .query(
            "UPDATE market_cutoff_claims SET busy = 0, claimed_at = NULL WHERE night_key = ? AND human_id = ?",
          )
          .run(key, row.human_id);
    });
    throw error;
  }
  transaction(ports.db, () => {
    for (const row of rows) {
      ports.db
        .query(
          "UPDATE market_cutoff_claims SET busy = 0 WHERE night_key = ? AND human_id = ?",
        )
        .run(key, row.human_id);
      const position = repo.position(row.human_id, key);
      position.average = row.average;
      realise(position, Number(row.size), row.amount);
      ports.activity.append({
        nightKey: key,
        propertyId: ports.inventory.get(key).propertyId,
        kind: "cutoff_pushed",
        actor: "trader",
        userId: row.id,
        tenths: Number(row.size),
      });
    }
  });
}
