import type { Database } from "bun:sqlite";

// Include both ends of every link, including historical canonical identifiers.
export function enrollmentAliases(db: Database, humanId: string): string[] {
  return db
    .query<{ id: string }, [string]>(
      `WITH RECURSIVE aliases(id) AS (
        SELECT ?
        UNION
        SELECT e.human_id FROM world_id_enrollments e JOIN aliases a ON e.nullifier = a.id
        UNION
        SELECT e.nullifier FROM world_id_enrollments e JOIN aliases a ON e.human_id = a.id
      ) SELECT id FROM aliases`,
    )
    .all(humanId)
    .map(({ id }) => id);
}
