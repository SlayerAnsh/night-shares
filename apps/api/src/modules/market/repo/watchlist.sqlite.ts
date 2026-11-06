import type { Database } from "bun:sqlite";

export function sqliteWatchlist(db: Database, id: string): Set<string> {
  const read = () =>
    new Set(
      db
        .query<{ night_key: string }, [string]>(
          "SELECT night_key FROM market_watchlist WHERE human_id = ? ORDER BY rowid",
        )
        .all(id)
        .map((row) => row.night_key),
    );
  const watch = new Set<string>();
  Object.defineProperty(watch, "size", { get: () => read().size });
  watch.has = (key) => read().has(key);
  watch.keys = () => read().keys();
  watch.values = () => read().values();
  watch.entries = () => read().entries();
  watch[Symbol.iterator] = watch.values;
  watch.forEach = (callback, thisArg) => {
    read().forEach((value) => {
      callback.call(thisArg, value, value, watch);
    });
  };
  watch.add = (key) => {
    db.query("INSERT OR IGNORE INTO market_watchlist VALUES (?, ?)").run(
      id,
      key,
    );
    return watch;
  };
  watch.delete = (key) =>
    db
      .query(
        "DELETE FROM market_watchlist WHERE human_id = ? AND night_key = ?",
      )
      .run(id, key).changes > 0;
  watch.clear = () => {
    db.query("DELETE FROM market_watchlist WHERE human_id = ?").run(id);
  };
  return watch;
}
