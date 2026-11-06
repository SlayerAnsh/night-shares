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
  const { client } = await identityServer();
  const result = await client.completeSignIn({ requestId, proof });
  if (!result.user || !result.sessionToken)
    throw new Error("Sign in returned no session.");
  (await cookies()).set({ ...sessionCookie, value: result.sessionToken });
  return result.user;
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
