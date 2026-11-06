import type { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { transaction } from "./transaction";

export function migrate(
  db: Database,
  directory = join(import.meta.dir, "migrations"),
): void {
  transaction(db, () => {
    db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE)",
    );
    const seen = new Set<number>();
    for (const name of readdirSync(directory)
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      if (!/^\d{3}-[a-z][a-z0-9-]*\.sql$/.test(name))
        throw new Error(`Invalid migration name: ${name}`);
      const version = Number(name.slice(0, 3));
      if (seen.has(version))
        throw new Error(`Duplicate migration number: ${version}`);
      seen.add(version);
      const applied = db
        .query<{ name: string }, [number]>(
          "SELECT name FROM schema_migrations WHERE version = ?",
        )
        .get(version);
      if (applied) {
        if (applied.name !== name)
          throw new Error(`Migration ${version} was renamed.`);
        continue;
      }
      db.exec(readFileSync(join(directory, name), "utf8"));
      db.query(
        "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
      ).run(version, name);
    }
  });
}
