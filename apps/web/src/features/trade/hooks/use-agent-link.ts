"use client";
import { useMutation } from "@connectrpc/connect-query";
import {
  type CompleteSignInRequest,
  WorldIdMode,
} from "@night-shares/proto/identity/v1/identity_pb";
import { linkAgentPass } from "@night-shares/proto/market/v1/market-MarketService_connectquery";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { verifyWithIdkit } from "../../../world-id/world-id-client.idkit";
export function useAgentLink() {
  const rpc = useMutation(linkAgentPass);
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function link() {
    setPending(true);
    setError("");
    try {
      const { verification } = await rpc.mutateAsync({});
      if (!verification)
        throw new Error("World ID verification is unavailable.");
      const submit = (proof: CompleteSignInRequest["proof"]) => {
        if (proof.case !== "mockProof" && proof.case !== "idkitResultJson")
          throw new Error("World ID proof is missing.");
        return rpc.mutateAsync({ requestId: verification.requestId, proof });
      };
      const result =
        verification.mode === WorldIdMode.WORLD_ID
          ? await verifyWithIdkit(verification, "orb", submit)
          : verification.mode === WorldIdMode.MOCK
            ? await submit({
                case: "mockProof",
                value: `mock:${params.get("seed") ?? "trader"}:orb`,
              })
            : undefined;
      if (!result?.checkpoint?.authorizeUrl)
        throw new Error("Agent Pass enrollment is unavailable.");
      sessionStorage.setItem("agentCheckpoint", result.checkpoint.attemptId);
      window.location.assign(result.checkpoint.authorizeUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }
  return { link, error, pending };
}
