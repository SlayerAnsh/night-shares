import { DomainError } from "../../shared/errors/domain-error";
import type { IdentityProof, IdentityRequest } from "./identity-verifier";
import { signalHash } from "./signal-hash";
import { normalizeNullifier, worldIdError } from "./world-id-errors";
import { object, parsePayload } from "./world-id-payload";

export async function verifyWorldResult(
  deps: {
    endpoint: string;
    environment: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
  },
  proof: IdentityProof,
  expected: {
    action: string;
    context: NonNullable<IdentityRequest["context"]>;
  },
  signal: string,
) {
  const { payload, json } = parsePayload(proof);
  if (
    payload.nonce !== expected.context.nonce ||
    payload.environment !== deps.environment ||
    (payload.action ?? "") !== expected.action ||
    !["4.0", ...(expected.context.allowLegacy ? ["3.0"] : [])].includes(
      String(payload.protocol_version),
    )
  )
    throw worldIdError("verification_rejected");
  if (!Array.isArray(payload.responses) || payload.responses.length !== 1)
    throw worldIdError("verification_rejected");
  const item = object(payload.responses[0]);
  const level: "orb" | "device" | undefined = [
    "proof_of_human",
    "orb",
  ].includes(String(item.identifier))
    ? "orb"
    : item.identifier === "selfie"
      ? "device"
      : undefined;
  if (
    !level ||
    (expected.context.credential === "proofOfHuman" && level !== "orb")
  )
    throw worldIdError("credential_unavailable");
  if (
    normalizeNullifier(item.signal_hash) !==
    normalizeNullifier(signalHash(signal))
  )
    throw worldIdError("verification_rejected");
  try {
    const response = await (deps.fetch ?? fetch)(deps.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: json,
      signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000),
    });
    const result = object(await response.json());
    if (
      !response.ok ||
      result.success !== true ||
      result.environment !== deps.environment
    )
      throw worldIdError(result.code);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw worldIdError("verification_rejected");
  }
  return { payload, item, level };
}
