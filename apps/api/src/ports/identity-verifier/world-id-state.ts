import type { Database } from "bun:sqlite";
import { DomainError } from "../../shared/errors/domain-error";
import type { VerificationLevel } from "./identity-verifier";
import { worldIdError } from "./world-id-errors";

type Link = { humanId: string; level: VerificationLevel };
export function createWorldIdState(db: Database) {
  return {
    session(sessionId: string): Link | undefined {
      return (
        db
          .query<Link, [string]>(
            "SELECT human_id AS humanId, level FROM world_id_sessions WHERE session_id = ?",
          )
          .get(sessionId) ?? undefined
      );
    },
    sessionFor(humanId: string, level: VerificationLevel) {
      return db
        .query<{ sessionId: string }, [string, string]>(
          "SELECT session_id AS sessionId FROM world_id_sessions WHERE human_id = ? AND (level = ? OR level = 'orb') ORDER BY rowid LIMIT 1",
        )
        .get(humanId, level)?.sessionId;
    },
    enrollment(nullifier: string): Link | undefined {
      return (
        db
          .query<Link, [string]>(
            "SELECT human_id AS humanId, level FROM world_id_enrollments WHERE nullifier = ?",
          )
          .get(nullifier) ?? undefined
      );
    },
    link(nullifier: string, sessionId: string, level: VerificationLevel) {
      const existing = this.enrollment(nullifier);
      const humanId = existing?.humanId ?? nullifier;
      const session = this.session(sessionId);
      if (session && session.humanId !== humanId)
        throw new DomainError(
          "PERMISSION_DENIED",
          "This session belongs to another World ID.",
        );
      db.transaction(() => {
        db.query(
          "INSERT OR IGNORE INTO world_id_enrollments VALUES (?, ?, ?)",
        ).run(nullifier, humanId, level);
        db.query(
          "INSERT OR IGNORE INTO world_id_sessions VALUES (?, ?, ?)",
        ).run(sessionId, humanId, level);
      }).immediate();
      return humanId;
    },
    acceptOnce(action: string, nullifier: string) {
      const result = db
        .query("INSERT OR IGNORE INTO world_id_nullifiers VALUES (?, ?)")
        .run(action, nullifier);
      if (!result.changes) throw worldIdError("nullifier_replayed");
    },
  };
}
