import { createHash } from "node:crypto";
import { DomainError } from "../../shared/errors/domain-error";
import type { Clock } from "../clock/clock";
import type { IdGenerator } from "../ids/id-generator";
import type { IdentityVerifier, VerificationLevel } from "./identity-verifier";
export function createMockIdentityVerifier({
  clock,
  ids,
}: {
  clock: Clock;
  ids: IdGenerator;
}): IdentityVerifier {
  const requests = new Map<
    string,
    { level: VerificationLevel; expiresAt: number }
  >();
  return {
    async startRequest(level) {
      const requestId = ids.next("wid");
      const expiresAt = clock.now() + 300_000;
      requests.set(requestId, { level, expiresAt });
      return {
        requestId,
        qrPayload: `mock-world-id:${requestId}:${level}`,
        expiresAt,
      };
    },
    async verifyProof({ requestId, proof, action }) {
      const match = /^mock:([^:]+):(orb|device)$/.exec(proof);
      const seed = match?.[1];
      const level = match?.[2];
      if (!seed || (level !== "orb" && level !== "device") || !action)
        throw new DomainError(
          "UNAUTHENTICATED",
          "Invalid mock proof or action.",
        );
      if (requestId !== undefined) {
        const request = requests.get(requestId);
        if (
          !request ||
          request.expiresAt <= clock.now() ||
          (request.level === "orb" && level !== "orb")
        )
          throw new DomainError(
            "UNAUTHENTICATED",
            "World ID request is invalid or expired.",
          );
        requests.delete(requestId);
      }
      const nullifier = createHash("sha256")
        .update(JSON.stringify([seed, action]))
        .digest("hex");
      return { nullifier, level };
    },
  };
}
