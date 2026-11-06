import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { WorldIdMode } from "@night-shares/proto/identity/v1/identity_pb";
import { DomainError } from "../../shared/errors/domain-error";
import type { Clock } from "../clock/clock";
import type { IdGenerator } from "../ids/id-generator";
import type { IdentityVerifier } from "./identity-verifier";
import { createRequestStore } from "./request-store.sqlite";
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
  const requests = createRequestStore(deps);
  return {
    async startRequest(level, purpose, userId) {
      const request = requests.start(level, purpose, userId);
      return {
        ...request,
        qrPayload: `mock-world-id:${request.requestId}:${level}`,
        appId: "",
        action: deps.action ?? "night-shares-human",
        mode: WorldIdMode.MOCK,
      };
    },
    async verifyProof({ requestId, proof, action, userId }) {
      const request = requests.consume(requestId, action, userId);
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
      return {
        subject: mockSubjectFor(seed),
        nullifier: mockSubjectFor(seed),
        level,
      };
    },
  };
}
