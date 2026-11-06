import { DomainError } from "../../shared/errors/domain-error";

export function worldIdError(code: unknown): DomainError {
  const key = typeof code === "string" ? code : "generic_error";
  const messages: Record<string, string> = {
    cancelled: "World ID verification was cancelled. Please retry.",
    user_rejected: "World ID verification was cancelled. Please retry.",
    verification_rejected: "World ID verification was rejected. Please retry.",
    credential_unavailable: "The required World ID credential is unavailable.",
    world_id_4_not_available: "A World ID 4.0 credential is required.",
    world_id_3_not_available: "The requested legacy credential is unavailable.",
    identity_attributes_not_matched:
      "This World ID does not meet the eligibility requirements.",
    nullifier_replayed: "This World ID proof was already used for this action.",
    duplicate_nonce:
      "This World ID request was already used. Start a new request.",
    rp_signature_expired: "World ID request expired. Please retry.",
    timestamp_too_old: "World ID request expired. Please retry.",
    timeout: "World ID verification timed out. Please retry.",
  };
  return new DomainError(
    "UNAUTHENTICATED",
    messages[key] ?? "World ID verification failed. Please retry.",
  );
}

export function normalizeNullifier(value: unknown): string {
  if (typeof value !== "string" || !/^(0x[\da-fA-F]+|\d+)$/.test(value))
    throw worldIdError("verification_rejected");
  const number = BigInt(value);
  if (number < 0n || number >= 1n << 256n)
    throw worldIdError("verification_rejected");
  return number.toString(10);
}
