"use client";
import type { StartVerifyActionResponse } from "@night-shares/proto/identity/v1/identity_pb";
import {
  CredentialRequest,
  IDKitRequestWidget,
  type IDKitResult,
  IDKitSessionWidget,
  proofOfHuman,
  selfieCheck,
} from "@worldcoin/idkit";
import { useRef } from "react";
import type { AccessLevel } from "../session/access";

export function IdKitPrompt(props: {
  request: Pick<
    StartVerifyActionResponse,
    "appId" | "action" | "signal" | "context"
  >;
  level: AccessLevel;
  handleVerify: (proof: IDKitResult) => Promise<void>;
  onSuccess: () => void;
  onCancel: () => void;
  onError: (code: string) => void;
}) {
  const verified = useRef(false);
  const context = props.request.context;
  if (!context) throw new Error("World ID request context is missing.");
  const common = {
    open: true,
    onOpenChange: (open: boolean) => {
      if (!open && !verified.current) props.onCancel();
    },
    app_id: props.request.appId as `app_${string}`,
    rp_context: {
      rp_id: context.rpId,
      nonce: context.nonce,
      created_at: Number(context.createdAt),
      expires_at: Number(context.expiresAt),
      signature: context.signature,
    },
    environment:
      context.environment === "production"
        ? ("production" as const)
        : ("staging" as const),
    handleVerify: async (proof: IDKitResult) => {
      await props.handleVerify(proof);
      verified.current = true;
    },
    onSuccess: props.onSuccess,
    onError: props.onError,
  };
  if (context.sessionId && context.sessionId !== "create")
    return (
      <IDKitSessionWidget
        {...common}
        existing_session_id={context.sessionId as `session_${string}`}
        constraints={CredentialRequest(
          context.credential === "proofOfHuman" ? "proof_of_human" : "selfie",
          { signal: props.request.signal },
        )}
      />
    );
  return (
    <IDKitRequestWidget
      {...common}
      action={props.request.action}
      session_id={context.sessionId === "create" ? "create" : undefined}
      allow_legacy_proofs={context.allowLegacy}
      preset={
        context.credential === "proofOfHuman"
          ? proofOfHuman({ signal: props.request.signal })
          : selfieCheck({ signal: props.request.signal })
      }
    />
  );
}
