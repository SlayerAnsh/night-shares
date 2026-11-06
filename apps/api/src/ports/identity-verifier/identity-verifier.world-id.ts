import type { Database } from "bun:sqlite";
import { WorldIdMode } from "@night-shares/proto/identity/v1/identity_pb";
import { DomainError } from "../../shared/errors/domain-error";
import type { Clock } from "../clock/clock";
import type { IdGenerator } from "../ids/id-generator";
import type { IdentityVerifier } from "./identity-verifier";
import { createRequestStore } from "./request-store.sqlite";
import { signalHash } from "./signal-hash";

export function createWorldIdIdentityVerifier(deps: {
  db: Database;
  clock: Clock;
  ids: IdGenerator;
  appId: string;
  action?: string;
  verifyUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): IdentityVerifier {
  if (!deps.appId.trim())
    throw new Error("WORLD_ID_APP_ID is required in world-id mode.");
  const action = deps.action ?? "night-shares-human";
  const endpoint = (
    deps.verifyUrl ?? "https://developer.world.org/api/v2/verify/{app_id}"
  ).replace("{app_id}", encodeURIComponent(deps.appId));
  const requests = createRequestStore(deps);
  return {
    async startRequest(level, purpose, userId) {
      return {
        ...requests.start(level, purpose, userId),
        qrPayload: "",
        appId: deps.appId,
        action,
        mode: WorldIdMode.WORLD_ID,
      };
    },
    async verifyProof({ requestId, proof, action: purpose, userId }) {
      const request = requests.consume(requestId, purpose, userId);
      if (
        typeof proof === "string" ||
        !proof.merkleRoot ||
        !proof.nullifierHash ||
        !proof.proof ||
        !["orb", "device"].includes(proof.verificationLevel) ||
        (request.level === "orb" && proof.verificationLevel !== "orb")
      )
        throw new DomainError(
          "UNAUTHENTICATED",
          "A World ID proof with the required verification level is required.",
        );
      try {
        const response = await (deps.fetch ?? fetch)(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000),
          body: JSON.stringify({
            nullifier_hash: proof.nullifierHash,
            merkle_root: proof.merkleRoot,
            proof: proof.proof,
            verification_level: proof.verificationLevel,
            action,
            signal_hash: signalHash(request.signal),
          }),
        });
        const result: unknown = await response.json();
        if (
          !response.ok ||
          typeof result !== "object" ||
          result === null ||
          !("success" in result) ||
          result.success !== true ||
          !("action" in result) ||
          result.action !== action ||
          !("nullifier_hash" in result) ||
          result.nullifier_hash !== proof.nullifierHash
        )
          throw new Error("Verification rejected");
        return {
          subject: proof.nullifierHash,
          nullifier: proof.nullifierHash,
          level: proof.verificationLevel === "orb" ? "orb" : "device",
        };
      } catch {
        // Provider errors and response bodies can contain proof material.
        throw new DomainError(
          "UNAUTHENTICATED",
          "World ID verification failed. Please start a new request.",
        );
      }
    },
  };
}
