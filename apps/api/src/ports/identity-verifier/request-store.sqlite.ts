import type { Database } from "bun:sqlite";
import { openDatabase } from "../../db/open-database";
import { DomainError } from "../../shared/errors/domain-error";
import type { Clock } from "../clock/clock";
import type { IdGenerator } from "../ids/id-generator";
import type { VerificationLevel } from "./identity-verifier";

type Request = {
  level: VerificationLevel;
  purpose: string;
  userId: string;
  signal: string;
  expiresAt: number | bigint;
};
export function createRequestStore(deps: {
  db?: Database;
  clock: Clock;
  ids: IdGenerator;
}) {
  const db = deps.db ?? openDatabase(":memory:");
  return {
    start(level: VerificationLevel, purpose = "sign_in", userId = "") {
      const requestId = deps.ids.next("wid");
      const signal = `${purpose}:${deps.ids.next("nonce")}`;
      const expiresAt = deps.clock.now() + 300_000;
      db.query("INSERT INTO identity_requests VALUES (?, ?, ?, ?, ?, ?)").run(
        requestId,
        level,
        purpose,
        userId,
        signal,
        expiresAt,
      );
      return { requestId, signal, expiresAt };
    },
    consume(requestId: string | undefined, purpose: string, userId = "") {
      // DELETE RETURNING burns the nonce before any asynchronous verification.
      const request = db
        .query<Request, [string]>(
          "DELETE FROM identity_requests WHERE id = ? RETURNING level, purpose, user_id AS userId, signal, expires_at AS expiresAt",
        )
        .get(requestId ?? "");
      if (
        !request ||
        Number(request.expiresAt) <= deps.clock.now() ||
        request.purpose !== purpose ||
        request.userId !== userId
      )
        throw new DomainError(
          "UNAUTHENTICATED",
          "World ID request is invalid or expired.",
        );
      return request;
    },
  };
}
