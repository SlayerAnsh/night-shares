import type { Database } from "bun:sqlite";
import { enrollmentAliases } from "../../../ports/identity-verifier/enrollment-aliases";

// Resolve at read time so newly linked enrollments immediately inherit existing bans.
export function isWalkBanned(db: Database, humanId: string): boolean {
  const ban = db.query(
    "SELECT 1 FROM walk_bans WHERE human_id = ? OR guest_id = ?",
  );
  return enrollmentAliases(db, humanId).some(
    (alias) => ban.get(alias, alias) !== null,
  );
}

export function banWalkReporter(
  db: Database,
  humanId: string,
  reportId: string,
  bannedAt: number,
) {
  const insert = db.query(
    "INSERT OR IGNORE INTO walk_bans (human_id, report_id, banned_at) VALUES (?, ?, ?)",
  );
  for (const alias of enrollmentAliases(db, humanId)) {
    insert.run(alias, reportId, bannedAt);
  }
}
