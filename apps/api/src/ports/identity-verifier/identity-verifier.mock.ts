import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { WorldIdMode } from "@night-shares/proto/identity/v1/identity_pb";
import { openDatabase } from "../../db/open-database";
import { DomainError } from "../../shared/errors/domain-error";
import type { Clock } from "../clock/clock";
import type { IdGenerator } from "../ids/id-generator";
import type { IdentityVerifier } from "./identity-verifier";
import { createRequestStore } from "./request-store.sqlite";
import { worldIdError } from "./world-id-errors";
import { createWorldIdState } from "./world-id-state";
export function mockSubjectFor(seed: string) {
  return createHash("sha256")
    .update(JSON.stringify([seed]))
    .digest("hex");
}
export function createMockIdentityVerifier(deps: {
  clock: Clock;
  ids: IdGenerator;
  db?: Database;
  action?: string;
}): IdentityVerifier {
  const db = deps.db ?? openDatabase(":memory:");
  const requests = createRequestStore({ ...deps, db });
  const state = createWorldIdState(db);

  return {
    async startRequest(level, purpose = "sign_in", userId, options) {
      const request = requests.start(level, purpose, userId);
      const saved = options?.sessionId;
      const sessionId = saved && state.session(saved) ? saved : "create";
      const action =
        purpose === "sign_in"
          ? (deps.action ?? "night-shares-enroll")
          : `${purpose}:${options?.resourceId || request.requestId}`;
      db.query("INSERT INTO world_id_requests VALUES (?, ?)").run(
        request.requestId,
        JSON.stringify({ sessionId, action, resourceId: options?.resourceId }),
      );
      return {
        ...request,
        context: {
          rpId: "rp_mock",
          nonce: request.signal,
          createdAt: BigInt(Math.floor(deps.clock.now() / 1000)),
          expiresAt: BigInt(Math.floor(request.expiresAt / 1000)),
          signature: "mock",
          sessionId,
          environment: "staging",
          allowLegacy: false,
          credential: level === "orb" ? "proofOfHuman" : "selfieCheck",
        },
        qrPayload: `mock-world-id:${request.requestId}:${level}`,
        appId: "",
        action,
        mode: WorldIdMode.MOCK,
      };
    },
    async verifyProof({ requestId, proof, action, userId }) {
      const request = requests.consume(requestId, action, userId);
      const row = db
        .query<{ context: string }, [string]>(
          "DELETE FROM world_id_requests WHERE request_id = ? RETURNING context",
        )
        .get(requestId ?? "");
      if (!row) throw worldIdError("duplicate_nonce");
      const context = JSON.parse(row.context) as {
        sessionId: string;
        action: string;
        resourceId?: string;
      };
      if (proof === "mock:cancel") throw worldIdError("cancelled");
      if (proof === "mock:reject") throw worldIdError("verification_rejected");
      const match =
        typeof proof === "string"
          ? /^mock:([^:]+):(orb|device)$/.exec(proof)
          : null;
      const seed = match?.[1];
      const level = match?.[2];
      if (
        !seed ||
        (level !== "orb" && level !== "device") ||
        (request.level === "orb" && level !== "orb")
      )
        throw new DomainError(
          "UNAUTHENTICATED",
          "Invalid mock proof or verification level.",
        );
      const subject = mockSubjectFor(seed);
      const sessionId =
        context?.sessionId === "create"
          ? `session_${deps.ids.next("world")}`
          : context?.sessionId;
      if (
        sessionId &&
        context?.sessionId !== "create" &&
        state.session(sessionId)?.humanId !== subject
      )
        throw worldIdError("verification_rejected");
      if (action === "sign_in" && sessionId)
        state.link(subject, sessionId, level);
      const nullifier =
        action === "sign_in"
          ? subject
          : mockSubjectFor(`${seed}:${context?.action}`);
      if (action !== "sign_in")
        state.acceptOnce(context?.action ?? action, nullifier);
      return {
        sessionId,
        resourceId: context.resourceId,
        subject: mockSubjectFor(seed),
        nullifier,
        level,
      };
    },
  };
}
