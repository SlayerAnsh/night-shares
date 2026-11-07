import type { Database } from "bun:sqlite";
import { readdirSync } from "node:fs";
import { URL } from "node:url";

export function createReadiness(db: Database) {
  const expected = readdirSync(
    new URL("../db/migrations/", import.meta.url),
  ).filter((name) => name.endsWith(".sql"));
  return () => {
    try {
      db.query("SELECT 1").get();
      const applied = db
        .query<{ version: bigint; name: string }, []>(
          "SELECT version, name FROM schema_migrations",
        )
        .all();
      return expected.every((name) =>
        applied.some(
          (row) =>
            row.name === name &&
            Number(row.version) === Number(name.slice(0, 3)),
        ),
      );
    } catch {
      return false;
    }
  };
}
