import type { Database } from "bun:sqlite";
import { WorldIdMode } from "@night-shares/proto/identity/v1/identity_pb";
import { signRequest } from "@worldcoin/idkit-core/signing";
import { DomainError } from "../../shared/errors/domain-error";
import type { Clock } from "../clock/clock";
import type { IdGenerator } from "../ids/id-generator";
import type { IdentityRequest, IdentityVerifier } from "./identity-verifier";
import { linkEnrollment } from "./link-enrollment";
import { createRequestStore } from "./request-store.sqlite";
import { verifyWorldResult } from "./verify-world-result";
import { normalizeNullifier, worldIdError } from "./world-id-errors";
import { parsePayload } from "./world-id-payload";
import { createWorldIdState } from "./world-id-state";

type Context = {
  action: string;
  context: NonNullable<IdentityRequest["context"]>;
};
export function createWorldIdIdentityVerifier(deps: {
  db: Database;
  clock: Clock;
  ids: IdGenerator;
  appId: string;
  rpId?: string;
  signingKey?: string;
  action?: string;
  verifyUrl?: string;
  environment?: "staging" | "production";
  allowLegacy?: boolean;
  deviceCredential?: "selfieCheck" | "proofOfHuman";
  fetch?: typeof fetch;
  timeoutMs?: number;
}): IdentityVerifier {
  if (!deps.rpId) throw new Error("WORLD_ID_RP_ID is required in cloud mode.");
  if (!deps.signingKey)
    throw new Error("WORLD_ID_SIGNING_KEY is required in cloud mode.");
  const rpId = deps.rpId,
    signingKey = deps.signingKey;
  const environment = deps.environment ?? "production";
  const endpoint = (
    deps.verifyUrl ?? "https://developer.world.org/api/v4/verify/{rp_id}"
  ).replace("{rp_id}", encodeURIComponent(rpId));
  const requests = createRequestStore(deps),
    state = createWorldIdState(deps.db);
  return {
    async startRequest(level, purpose = "sign_in", userId, options) {
      if (purpose !== "sign_in" && !options?.resourceId?.trim())
        throw new DomainError(
          "INVALID_ARGUMENT",
          "A booking or order ID is required for World ID action verification.",
        );
      const request = requests.start(level, purpose, userId);
      const sessionId = options?.sessionId ?? "";
      if (sessionId) {
        const session = state.session(sessionId);
        if (!session || (level === "orb" && session.level !== "orb"))
          throw worldIdError("credential_unavailable");
      }
      const action = sessionId
        ? ""
        : purpose === "sign_in"
          ? (deps.action ?? "night-shares-enroll")
          : `${purpose}:${options?.resourceId || request.requestId}`;
      const signed = signRequest({
        signingKeyHex: signingKey,
        action: action || undefined,
        ttl: 300,
      });
      const context = {
        rpId,
        nonce: signed.nonce,
        createdAt: BigInt(signed.createdAt),
        expiresAt: BigInt(signed.expiresAt),
        signature: signed.sig,
        sessionId: sessionId || (purpose === "sign_in" ? "create" : ""),
        environment,
        allowLegacy:
          purpose !== "sign_in" &&
          level === "orb" &&
          (deps.allowLegacy ?? true),
        credential:
          level === "orb"
            ? "proofOfHuman"
            : (deps.deviceCredential ?? "selfieCheck"),
      };
      let continuity: NonNullable<IdentityRequest["context"]> | undefined;
      if (purpose !== "sign_in") {
        const user = deps.db
          .query<{ humanId: string }, [string]>(
            "SELECT human_id AS humanId FROM identity_users WHERE id = ?",
          )
          .get(userId ?? "");
        const saved = user && state.sessionFor(user.humanId, level);
        if (!saved)
          throw new DomainError(
            "FAILED_PRECONDITION",
            "Enroll with the required World ID credential before this action.",
          );
        const signature = signRequest({ signingKeyHex: signingKey, ttl: 300 });
        continuity = {
          ...context,
          nonce: signature.nonce,
          signature: signature.sig,
          createdAt: BigInt(signature.createdAt),
          expiresAt: BigInt(signature.expiresAt),
          sessionId: saved,
          credential:
            state.session(saved)?.level === "orb"
              ? "proofOfHuman"
              : "selfieCheck",
          allowLegacy: false,
        };
      }
      const fullContext = {
        ...context,
        continuity: continuity
          ? {
              ...continuity,
              $typeName: "night_shares.identity.v1.WorldIdRequest" as const,
            }
          : undefined,
      };
      deps.db.query("INSERT INTO world_id_requests VALUES (?, ?)").run(
        request.requestId,
        JSON.stringify({ action, context: fullContext }, (_key, value) =>
          typeof value === "bigint" ? value.toString() : value,
        ),
      );
      return {
        ...request,
        qrPayload: "",
        appId: deps.appId,
        action,
        context: fullContext,
        mode: WorldIdMode.WORLD_ID,
      };
    },
    async verifyProof({ requestId, proof, action: purpose, userId }) {
      const request = requests.consume(requestId, purpose, userId);
      const row = deps.db
        .query<{ context: string }, [string]>(
          "DELETE FROM world_id_requests WHERE request_id = ? RETURNING context",
        )
        .get(requestId ?? "");
      if (!row) throw worldIdError("duplicate_nonce");
      const expected = JSON.parse(row.context) as Context;
      let actionProof = proof;
      let continuityProof: typeof proof | undefined;
      if (purpose !== "sign_in") {
        const envelope = parsePayload(proof).payload;
        actionProof = { idkitResultJson: JSON.stringify(envelope.uniqueness) };
        continuityProof = {
          idkitResultJson: JSON.stringify(envelope.continuity),
        };
      }
      const remote = { ...deps, endpoint, environment };
      const { payload, item, level } = await verifyWorldResult(
        remote,
        actionProof,
        expected,
        request.signal,
      );
      if (!expected.action) {
        if (payload.session_id !== expected.context.sessionId)
          throw worldIdError("verification_rejected");
        const session = state.session(expected.context.sessionId);
        if (!session || session.level !== level)
          throw worldIdError("credential_unavailable");
        if (
          !Array.isArray(item.session_nullifier) ||
          item.session_nullifier.length !== 2
        )
          throw worldIdError("verification_rejected");
        const nullifier = normalizeNullifier(item.session_nullifier[0]);
        state.acceptOnce(
          `session:${normalizeNullifier(item.session_nullifier[1])}`,
          nullifier,
        );
        return {
          subject: session.humanId,
          nullifier,
          level,
          sessionId: expected.context.sessionId,
        };
      }
      const nullifier = normalizeNullifier(item.nullifier);
      if (purpose === "sign_in") {
        if (
          typeof payload.session_id !== "string" ||
          !payload.session_id.startsWith("session_")
        )
          throw worldIdError("verification_rejected");
        linkEnrollment(deps.db, nullifier, level, userId);
        return {
          subject: state.link(nullifier, payload.session_id, level),
          nullifier,
          level,
          sessionId: payload.session_id,
        };
      }
      const context = expected.context.continuity;
      if (!context || !continuityProof)
        throw worldIdError("verification_rejected");
      const continuity = await verifyWorldResult(
        remote,
        continuityProof,
        { action: "", context },
        request.signal,
      );
      const session = state.session(context.sessionId);
      if (
        !session ||
        continuity.payload.session_id !== context.sessionId ||
        continuity.level !== session.level
      )
        throw worldIdError("verification_rejected");
      const pair = continuity.item.session_nullifier;
      if (!Array.isArray(pair) || pair.length !== 2)
        throw worldIdError("verification_rejected");
      deps.db
        .transaction(() => {
          state.acceptOnce(
            `session:${normalizeNullifier(pair[1])}`,
            normalizeNullifier(pair[0]),
          );
          state.acceptOnce(expected.action, nullifier);
        })
        .immediate();
      return {
        subject: session.humanId,
        nullifier,
        level: continuity.level,
        resourceId: expected.action.slice(purpose.length + 1),
        sessionId: context.sessionId,
      };
    },
  };
}
