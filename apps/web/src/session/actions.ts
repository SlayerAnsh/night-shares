"use server";
import { Code, ConnectError } from "@connectrpc/connect";
import type { CompleteSignInRequest } from "@night-shares/proto/identity/v1/identity_pb";
import { cookies } from "next/headers";
import { sessionCookie } from "./cookie";
import { identityServer } from "./identity-server";
export async function completeSignIn(
  requestId: string,
  proof: CompleteSignInRequest["proof"],
) {
  const { client, options } = await identityServer();
  const result = await client
    .completeSignIn({ requestId, proof }, options)
    .catch((error: unknown) => {
      if (error instanceof ConnectError) return { error: error.rawMessage };
      return { error: "Unable to verify World ID. Please retry." };
    });
  if ("error" in result) return result;
  if (!result.user || !result.sessionToken)
    throw new Error("Sign in returned no session.");
  (await cookies()).set({ ...sessionCookie, value: result.sessionToken });
  return { user: result.user, sessionId: result.sessionId };
}
export async function signOut() {
  const { client, options } = await identityServer();
  try {
    await client.signOut({}, options);
  } catch (error) {
    if (!(error instanceof ConnectError && error.code === Code.Unauthenticated))
      throw error;
  } finally {
    (await cookies()).delete(sessionCookie.name);
  }
}
