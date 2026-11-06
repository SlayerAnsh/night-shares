"use client";
import { useQuery } from "@connectrpc/connect-query";
import { getSession } from "@night-shares/proto/identity/v1/identity-IdentityService_connectquery";
import { retrySession } from "../../session/SessionProvider";

// True until the first session answer is in. Reads the same cached query as
// SessionProvider (same key and options), so it adds no request.
export function useSessionPending() {
  return useQuery(
    getSession,
    {},
    { retry: retrySession, meta: { session: true } },
  ).isPending;
}
