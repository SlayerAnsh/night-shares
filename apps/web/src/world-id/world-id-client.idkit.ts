"use client";
import type {
  CompleteSignInRequest,
  StartVerifyActionResponse,
} from "@night-shares/proto/identity/v1/identity_pb";
import type { ISuccessResult } from "@worldcoin/idkit";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { AccessLevel } from "../session/access";

export function idkitProof(
  result: ISuccessResult,
): CompleteSignInRequest["proof"] {
  return {
    case: "worldId",
    value: {
      $typeName: "night_shares.identity.v1.WorldIdProof",
      merkleRoot: result.merkle_root,
      nullifierHash: result.nullifier_hash,
      proof: result.proof,
      verificationLevel: result.verification_level,
    },
  };
}

export async function verifyWithIdkit<T>(
  request: Pick<StartVerifyActionResponse, "appId" | "action" | "signal">,
  level: AccessLevel,
  verify: (proof: CompleteSignInRequest["proof"]) => Promise<T>,
): Promise<T> {
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
          handleVerify: async (proof: ISuccessResult) => {
            result = await verify(idkitProof(proof));
          },
          onSuccess: () => resolve(result),
          onCancel: () =>
            reject(
              new Error(
                "World ID verification was cancelled. Start a new request.",
              ),
            ),
          onError: () =>
            reject(
              new Error("World ID verification failed. Start a new request."),
            ),
        }),
      );
    });
  } finally {
    root.unmount();
    node.remove();
  }
}
