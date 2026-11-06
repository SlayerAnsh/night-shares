import type { Database } from "bun:sqlite";

// Keep callbacks synchronous so the write lock covers every read and write.
export function transaction<T>(db: Database, work: () => T): T {
  return db.transaction(work).immediate();
}
