import type { IdentityProof } from "./identity-verifier";
import { worldIdError } from "./world-id-errors";

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw worldIdError("verification_rejected");
  return value as Record<string, unknown>;
}
export function parsePayload(proof: IdentityProof) {
  if (typeof proof !== "object" || !("idkitResultJson" in proof))
    throw worldIdError("verification_rejected");
  try {
    return {
      json: proof.idkitResultJson,
      payload: object(JSON.parse(proof.idkitResultJson)),
    };
  } catch {
    throw worldIdError("verification_rejected");
  }
}
