import type { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { transaction } from "../../db/transaction";
import type { Clock } from "../clock/clock";
import type { VerificationStore } from "./verification-store";

const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function createSqliteVerificationStore({
  db,
  clock,
}: {
  db: Database;
  clock: Clock;
}): VerificationStore {
  return {
    issue({ userId, action, resourceId }) {
      const token = randomBytes(32).toString("base64url");
      const expiresAt = clock.now() + 5 * 60000;
      db.query(
        "INSERT INTO verifications (token_hash, user_id, action, expires_at, resource_id) VALUES (?, ?, ?, ?, ?)",
      ).run(hash(token), userId, action, expiresAt, resourceId ?? "");
      return { token, expiresAt };
    },
    consume({ token, userId, action, resourceId }) {
      return transaction(db, () => {
        const row = db
          .query<
            {
              user_id: string;
              action: string;
              expires_at: bigint;
              resource_id: string;
            },
            [string]
          >(
            "UPDATE verifications SET consumed = 1 WHERE token_hash = ? AND consumed = 0 RETURNING user_id, action, expires_at, resource_id",
          )
          .get(hash(token));
        return (
          !!row &&
          row.user_id === userId &&
          row.action === action &&
          row.resource_id === (resourceId ?? "") &&
          row.expires_at > clock.now()
        );
      });
    },
  };
}
