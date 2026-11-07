import type { Database } from "bun:sqlite";
import { DomainError } from "../../shared/errors/domain-error";
import type { VerificationLevel } from "./identity-verifier";

// Chain upgrades preserve the custody identity; local upgrades migrate the canonical key.
export function linkEnrollment(
  db: Database,
  nullifier: string,
  level: VerificationLevel,
  userId?: string,
) {
  if (!userId || level !== "orb") return;
  db.transaction(() => {
    const user = db
      .query<{ humanId: string; level: string }, [string]>(
        "SELECT human_id AS humanId, level FROM identity_users WHERE id = ?",
      )
      .get(userId);
    if (!user || user.humanId === nullifier) return;
    const enrolled = db
      .query<{ humanId: string }, [string]>(
        "SELECT human_id AS humanId FROM world_id_enrollments WHERE nullifier = ?",
      )
      .get(nullifier);
    // Recovery of an existing enrollment signs into its existing account, without merging accounts.
    if (enrolled) return;
    if (
      user.level === "orb" ||
      db.query("SELECT 1 FROM identity_users WHERE human_id = ?").get(nullifier)
    )
      throw new DomainError(
        "PERMISSION_DENIED",
        "This Orb credential belongs to another identity. Switch accounts to continue.",
      );
    // Preserve the previous key even for users enrolled before alias tracking.
    db.query(
      "INSERT OR IGNORE INTO world_id_enrollments (nullifier, human_id, level) VALUES (?, ?, ?)",
    ).run(user.humanId, user.humanId, user.level);
    const chainActive = db
      .query("SELECT 1 FROM chain_instances WHERE active = 1")
      .get();
    const humanId = chainActive ? user.humanId : nullifier;
    if (!chainActive) {
      // Ban keys are permanent; alias lookups carry penalties to the upgraded identity.
      // Device users cannot own trader or host positions. Still migrate all indexed human references.
      for (const table of [
        "identity_users",
        "world_id_enrollments",
        "world_id_sessions",
        "walk_reports",
        "market_watchlist",
        "market_human_wallets",
        "market_holders",
      ]) {
        db.query(`UPDATE ${table} SET human_id = ? WHERE human_id = ?`).run(
          nullifier,
          user.humanId,
        );
      }
    }
    db.query(
      "INSERT INTO world_id_enrollments (nullifier, human_id, level) VALUES (?, ?, ?)",
    ).run(nullifier, humanId, level);
    db.query("UPDATE identity_users SET level = 'orb' WHERE id = ?").run(
      userId,
    );
    db.query(
      "UPDATE sessions SET user = json_set(user, '$.humanId', ?) WHERE json_extract(user, '$.id') = ?",
    ).run(humanId, userId);
  }).immediate();
}
