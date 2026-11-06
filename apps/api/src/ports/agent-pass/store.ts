import type { Database } from "bun:sqlite";
import { randomBytes } from "node:crypto";
import type { Clock } from "../clock/clock";
import type { IdGenerator } from "../ids/id-generator";
import type { AgentPass, Attempt } from "./agent-pass";
export const secret = () => randomBytes(32).toString("base64url");
export function checkpointStore(db: Database, clock: Clock, ids: IdGenerator) {
  function save(a: Attempt) {
    db.query(`INSERT INTO agent_pass_attempts VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status, expires_at=excluded.expires_at, record=excluded.record`).run(
      a.id,
      a.userId,
      a.orderId,
      a.state,
      a.status,
      a.expiresAt,
      JSON.stringify(a),
    );
  }
  function read(column: "id" | "state", value: string): Attempt | undefined {
    const row = db
      .query<{ record: string }, [string]>(
        `SELECT record FROM agent_pass_attempts WHERE ${column} = ?`,
      )
      .get(value);
    if (!row) return;
    const a = JSON.parse(row.record) as Attempt;
    if (a.status === "pending" && clock.now() >= a.expiresAt) {
      a.status = "expired";
      a.reason = "expired";
      save(a);
    }
    return a;
  }
  return {
    save,
    get: (id: string) => read("id", id),
    byState: (state: string) => read("state", state),
    create(input: Parameters<AgentPass["startCheckpoint"]>[0]) {
      const a: Attempt = {
        ...input,
        id: ids.next("checkpoint"),
        state: secret(),
        nonce: secret(),
        verifier: secret(),
        createdAt: clock.now(),
        expiresAt: clock.now() + 600_000,
        status: "pending",
        reason: "",
        claimed: false,
        allowEnrollment: !input.worldSub,
      };
      save(a);
      return a;
    },
    link(userId: string) {
      return db
        .query<{ iss: string; sub: string }, [string]>(
          "SELECT iss, sub FROM agent_pass_links WHERE user_id = ?",
        )
        .get(userId);
    },
    owner(iss: string, sub: string) {
      return db
        .query<{ user_id: string }, [string, string]>(
          "SELECT user_id FROM agent_pass_links WHERE iss = ? AND sub = ?",
        )
        .get(iss, sub)?.user_id;
    },
    enroll(userId: string, iss: string, sub: string) {
      db.query("INSERT INTO agent_pass_links VALUES (?, ?, ?)").run(
        userId,
        iss,
        sub,
      );
    },
  };
}
export type CheckpointStore = ReturnType<typeof checkpointStore>;
