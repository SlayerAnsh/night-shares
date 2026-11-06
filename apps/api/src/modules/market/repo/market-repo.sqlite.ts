import type { Database } from "bun:sqlite";
import { transaction } from "../../../db/transaction";
import { sqliteAgentOrders } from "./agent-orders.sqlite";
import type { MarketRepo } from "./market-repo";
import { sqlitePosition } from "./position.sqlite";
import { sqliteMap } from "./sqlite-map";
import { sqliteWatchlist } from "./watchlist.sqlite";

export function createSqliteMarketRepo(db: Database): MarketRepo {
  const queues = new Map<string, Promise<unknown>>();
  return {
    position: (id, key) => sqlitePosition(db, id, key),
    account(id) {
      return {
        positions: sqliteMap({
          read: () =>
            new Map(
              db
                .query<{ night_key: string }, [string]>(
                  "SELECT night_key FROM market_positions WHERE human_id = ? ORDER BY rowid",
                )
                .all(id)
                .map((row) => [
                  row.night_key,
                  sqlitePosition(db, id, row.night_key),
                ]),
            ),
          write(key, value) {
            transaction(db, () =>
              Object.assign(sqlitePosition(db, id, key), value),
            );
          },
          remove: (key) =>
            db
              .query(
                "DELETE FROM market_positions WHERE human_id = ? AND night_key = ?",
              )
              .run(id, key).changes > 0,
          clear() {
            db.query("DELETE FROM market_positions WHERE human_id = ?").run(id);
          },
        }),
        watch: sqliteWatchlist(db, id),
        orders: sqliteAgentOrders(db, id),
      };
    },
    async exclusive(id, work) {
      const previous = queues.get(id) ?? Promise.resolve();
      const result = previous.then(work, work);
      queues.set(id, result);
      try {
        return await result;
      } finally {
        if (queues.get(id) === result) queues.delete(id);
      }
    },
  };
}
