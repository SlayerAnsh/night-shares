import { mock } from "bun:test";
import { openDatabase } from "../../db/open-database";
import { createMockClock } from "../clock/clock.mock";
import { createMockIdGenerator } from "../ids/id-generator.mock";
import type { IdentityRequest } from "./identity-verifier";
import { createWorldIdIdentityVerifier } from "./identity-verifier.world-id";
import { signalHash } from "./signal-hash";

export function setupWorldId(
  response = async () =>
    Response.json({ success: true, environment: "staging" }),
) {
  const db = openDatabase(":memory:");
  const fetcher = mock((_url: string | URL | Request, _options?: RequestInit) =>
    response(),
  );
  const deps = {
    db,
    clock: createMockClock(0),
    ids: createMockIdGenerator(),
    appId: "app_test",
    rpId: "rp_test",
    signingKey: "01".repeat(32),
    fetch: fetcher as unknown as typeof fetch,
  };
  return { ...deps, fetcher, verifier: createWorldIdIdentityVerifier(deps) };
}
export function enrollment(
  request: IdentityRequest,
  nullifier = "0x42",
  sessionId = "session_alice",
  identifier = "proof_of_human",
) {
  return {
    protocol_version: "4.0",
    nonce: request.context?.nonce,
    action: request.action,
    environment: "staging",
    session_id: sessionId,
    responses: [
      {
        identifier,
        signal_hash: signalHash(request.signal),
        nullifier,
        proof: ["0x1", "0x2", "0x3", "0x4", "0x5"],
        issuer_schema_id: identifier === "selfie" ? 11 : 1,
      },
    ],
  };
}
export function jsonProof(payload: unknown) {
  return { idkitResultJson: JSON.stringify(payload) };
}
