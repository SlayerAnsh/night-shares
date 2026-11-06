import type { Deps } from "../context";

// A cutoff must not consume a reservation whose wallet settlement is still pending.
export async function withSettlement<T>(
  deps: Deps,
  key: string,
  run: () => Promise<T>,
): Promise<T> {
  const id = deps.ports.ids.next("settlement");
  deps.ports.db
    .query("INSERT INTO market_settlements VALUES (?, ?)")
    .run(id, key);
  try {
    return await run();
  } finally {
    deps.ports.db.query("DELETE FROM market_settlements WHERE id = ?").run(id);
  }
}
