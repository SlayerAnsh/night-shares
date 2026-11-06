import type { Database } from "bun:sqlite";
import type { User } from "../../../ports/sessions/session-store";
import type { UserRepo } from "./user-repo";

export function createSqliteUserRepo({ db }: { db: Database }): UserRepo {
  return {
    get(humanId) {
      return (
        db
          .query<User, [string]>(
            "SELECT id, human_id AS humanId, level, wallet_address AS walletAddress FROM identity_users WHERE human_id = ?",
          )
          .get(humanId) ?? undefined
      );
    },
    save(user) {
      db.query(
        `INSERT INTO identity_users (human_id, id, level, wallet_address) VALUES (?, ?, ?, ?)
        ON CONFLICT (human_id) DO UPDATE SET id = excluded.id, level = excluded.level, wallet_address = excluded.wallet_address`,
      ).run(user.humanId, user.id, user.level, user.walletAddress);
    },
  };
}
