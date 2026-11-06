import type { Database } from "bun:sqlite";
import type { Position } from "./market-repo";

const columns = {
  free: "free",
  average: "average",
  realised: "realised",
  escrow: "escrow",
  askPrice: "ask_price",
  closed: "closed",
  wins: "wins",
  returns: "returns",
} as const;

export function sqlitePosition(
  db: Database,
  humanId: string,
  key: string,
): Position {
  db.query(
    "INSERT OR IGNORE INTO market_positions (human_id, night_key) VALUES (?, ?)",
  ).run(humanId, key);
  const position = {} as Position;
  // Accessors retain the mutable port without keeping stale values after rollback.
  for (const field of Object.keys(columns) as (keyof Position)[]) {
    const column = columns[field];
    Object.defineProperty(position, field, {
      enumerable: true,
      get() {
        const row = db
          .query<{ value: bigint }, [string, string]>(
            `SELECT ${column} AS value FROM market_positions WHERE human_id = ? AND night_key = ?`,
          )
          .get(humanId, key);
        const value = row?.value ?? 0n;
        return field === "average" ||
          field === "realised" ||
          field === "askPrice"
          ? value
          : Number(value);
      },
      set(value: number | bigint) {
        db.query(
          `UPDATE market_positions SET ${column} = ? WHERE human_id = ? AND night_key = ?`,
        ).run(value, humanId, key);
      },
    });
  }
  return position;
}
