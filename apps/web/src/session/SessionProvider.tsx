"use client";
import { Code, ConnectError } from "@connectrpc/connect";
import { useQuery } from "@connectrpc/connect-query";
import { getSession } from "@night-shares/proto/identity/v1/identity-IdentityService_connectquery";
import type { User } from "@night-shares/proto/identity/v1/user_pb";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext } from "react";
import { type AccessLevel, sessionLevel } from "./access";

type Session = {
  user: User | null;
  level: AccessLevel | null;
  isSignedIn: boolean;
  refresh: () => Promise<void>;
};
const SessionContext = createContext<Session | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  const query = useQuery(
    getSession,
    {},
    { retry: false, meta: { session: true } },
  );
  const user = query.error ? null : (query.data?.user ?? null);
  async function refresh() {
    // Account changes must not retain another user's query data.
    await cache.cancelQueries();
    cache.removeQueries({ predicate: (entry) => entry.meta?.session !== true });
    cache.getMutationCache().clear();
    await query.refetch();
  }
  if (
    query.error &&
    !(
      query.error instanceof ConnectError &&
      query.error.code === Code.Unauthenticated
    )
  ) {
    return (
      <p role="alert">
        Session unavailable.{" "}
        <button type="button" onClick={() => void query.refetch()}>
          Retry
        </button>
      </p>
    );
  }
  return (
    <SessionContext.Provider
      value={{
        user,
        level: sessionLevel(user?.level),
        isSignedIn: !!user,
        refresh,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession requires SessionProvider.");
  return session;
}
