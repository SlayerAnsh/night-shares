"use client";
import type {
  CompleteSignInRequest,
  StartVerifyActionResponse,
} from "@night-shares/proto/identity/v1/identity_pb";
import type { IDKitResult } from "@worldcoin/idkit";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { AccessLevel } from "../session/access";

export function idkitProof(
  result: IDKitResult,
): CompleteSignInRequest["proof"] {
  return { case: "idkitResultJson", value: JSON.stringify(result) };
}

export async function verifyWithIdkit<T>(
  request: Pick<
    StartVerifyActionResponse,
    "appId" | "action" | "signal" | "context"
  >,
  level: AccessLevel,
  verify: (proof: CompleteSignInRequest["proof"]) => Promise<T>,
): Promise<T> {
  if (request.context?.continuity) {
    const uniqueness = await verifyWithIdkit(
      { ...request, context: { ...request.context, continuity: undefined } },
      level,
      async (proof) => proof,
    );
    const continuity = await verifyWithIdkit(
      { ...request, action: "", context: request.context.continuity },
      level,
      async (proof) => proof,
    );
    if (
      uniqueness.case !== "idkitResultJson" ||
      continuity.case !== "idkitResultJson"
    )
      throw new Error("World ID proof is missing.");
    return verify({
      case: "idkitResultJson",
      value: JSON.stringify({
        uniqueness: JSON.parse(uniqueness.value),
        continuity: JSON.parse(continuity.value),
      }),
    });
  }
  const { IdKitPrompt } = await import("./IdKitPrompt");
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  try {
    return await new Promise<T>((resolve, reject) => {
      let result: T;
      root.render(
        createElement(IdKitPrompt, {
          request,
          level,
          handleVerify: async (proof: IDKitResult) => {
            result = await verify(idkitProof(proof));
          },
          onSuccess: () => resolve(result),
          onCancel: () =>
            reject(
              new Error(
                "World ID verification was cancelled. Start a new request.",
              ),
            ),
          onError: (code: string) => reject(new Error(worldIdMessage(code))),
        }),
      );
    });
  } finally {
    root.unmount();
    node.remove();
  }
}

export function worldIdMessage(code: string): string {
  if (["cancelled", "user_rejected"].includes(code))
    return "World ID verification was cancelled. Please retry.";
  if (
    [
      "credential_unavailable",
      "world_id_4_not_available",
      "world_id_3_not_available",
    ].includes(code)
  )
    return "The required World ID credential is unavailable. Try an eligible credential.";
  if (["rp_signature_expired", "timestamp_too_old", "timeout"].includes(code))
    return "World ID request expired. Please retry.";
  if (
    [
      "nullifier_replayed",
      "duplicate_nonce",
      "max_verifications_reached",
    ].includes(code)
  )
    return "This World ID proof was already used. Start a new request.";
  if (code === "identity_attributes_not_matched")
    return "This World ID does not meet the eligibility requirements.";
  return "World ID verification was rejected. Please retry.";
}
