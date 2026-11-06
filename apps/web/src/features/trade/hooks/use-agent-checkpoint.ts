"use client";
import { useQuery } from "@connectrpc/connect-query";
import { getAgentCheckpoint } from "@night-shares/proto/market/v1/market-MarketService_connectquery";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
export function useAgentCheckpoint() {
  const params = useSearchParams();
  const returned = params.get("checkpoint");
  const [attemptId, setAttemptId] = useState("");
  useEffect(() => {
    if (returned) setAttemptId(sessionStorage.getItem("agentCheckpoint") ?? "");
  }, [returned]);
  const result = useQuery(
    getAgentCheckpoint,
    { attemptId },
    { enabled: !!attemptId && !!returned },
  );
  if (!returned) return "";
  if (result.error)
    return "Unable to confirm checkpoint status. Review your order before retrying.";
  const status = result.data?.status;
  if (status === "used")
    return "World ID approval completed. The agent order executed.";
  if (status === "denied")
    return `World ID approval denied (${result.data?.reason}). The order remains blocked.`;
  if (status === "cancelled")
    return "World ID approval cancelled. The order remains blocked.";
  if (status === "expired")
    return "World ID approval expired. The order remains blocked. Start a new approval to retry.";
  return "Checkpoint returned. Review the order status below.";
}
