import { expect, test } from "bun:test";
import type { IDKitResult } from "@worldcoin/idkit";
import { idkitProof, worldIdMessage } from "./world-id-client.idkit";

test("IDKit forwards the complete v4 credential result without losing integrity fields", () => {
  const result = {
    protocol_version: "4.0",
    nonce: "nonce",
    action: "night-shares-enroll",
    environment: "staging",
    session_id: "session_alice",
    responses: [
      {
        identifier: "selfie",
        signal_hash: "0x00",
        proof: ["0x1", "0x2", "0x3", "0x4", "0x5"],
        nullifier: "0x42",
        issuer_schema_id: 11,
        expires_at_min: 1,
        sybil_score: 10,
      },
    ],
    integrity_bundle: {
      version: 2,
      signature_format: "apple_app_attest",
      timestamp: 1,
      signature: "signature",
      jwt: "jwt",
    },
  } satisfies IDKitResult;
  const proof = idkitProof(result);
  expect(proof.case).toBe("idkitResultJson");
  expect(proof.value).toBe(JSON.stringify(result));
});

test("cancellation, unavailable credentials, rejection, expiry and replay have retry guidance", () => {
  for (const code of [
    "cancelled",
    "credential_unavailable",
    "verification_rejected",
    "rp_signature_expired",
    "nullifier_replayed",
  ])
    expect(worldIdMessage(code)).not.toBe("");
  expect(worldIdMessage("cancelled")).toContain("cancelled");
  expect(worldIdMessage("credential_unavailable")).toContain("unavailable");
  expect(worldIdMessage("nullifier_replayed")).toContain("already used");
});
