"use client";
import { useMutation } from "@connectrpc/connect-query";
import {
  type CompleteSignInRequest,
  WorldIdMode,
} from "@night-shares/proto/identity/v1/identity_pb";
import {
  startVerifyAction,
  verifyAction,
} from "@night-shares/proto/identity/v1/identity-IdentityService_connectquery";
import { useState } from "react";
import { verifyWithIdkit } from "./world-id-client.idkit";

export function useVerifyAction() {
  const start = useMutation(startVerifyAction);
  const verify = useMutation(verifyAction);
  const [pending, setPending] = useState(false);
  async function mutateAsync(input: {
    action: "check_in" | "approve_agent_order";
    proof: string;
  }) {
    setPending(true);
    try {
      const request = await start.mutateAsync({ action: input.action });
      const submit = (proof: CompleteSignInRequest["proof"]) =>
        verify.mutateAsync({
          action: input.action,
          requestId: request.requestId,
          proof,
        });
      if (request.mode === WorldIdMode.WORLD_ID)
        return await verifyWithIdkit(
          request,
          input.action === "approve_agent_order" ? "orb" : "device",
          submit,
        );
      if (request.mode !== WorldIdMode.MOCK)
        throw new Error("Unsupported World ID mode.");
      return await submit({ case: "mockProof", value: input.proof });
    } finally {
      setPending(false);
    }
  }
  return {
    ...verify,
    mutateAsync,
    isPending: pending || start.isPending || verify.isPending,
  };
}
