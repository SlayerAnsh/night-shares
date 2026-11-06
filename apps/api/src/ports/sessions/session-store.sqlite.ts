import type { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";
import type { Clock } from "../clock/clock";
import type { SessionStore, User } from "./session-store";

const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function createSqliteSessionStore({
  db,
  clock,
}: {
  db: Database;
  clock: Clock;
}): SessionStore {
  return {
    create(user) {
      const token = randomBytes(32).toString("base64url");
      db.query("INSERT INTO sessions VALUES (?, ?, ?)").run(
        hash(token),
        JSON.stringify(user),
        clock.now() + 7 * 86400000,
      );
      return token;
    },
    get(token) {
      const row = db
        .query<{ user: string }, [string, number]>(
          "SELECT user FROM sessions WHERE token_hash = ? AND expires_at > ?",
        )
        .get(hash(token), clock.now());
      return row ? (JSON.parse(row.user) as User) : undefined;
    },
    delete(token) {
      db.query("DELETE FROM sessions WHERE token_hash = ?").run(hash(token));
    },
  };
}
