import { Code, ConnectError } from "@connectrpc/connect";
import type { User } from "@night-shares/proto/identity/v1/user_pb";
import { redirect } from "next/navigation";
import { type AccessLevel, canAccess, loginHref, sessionLevel } from "./access";
import { identityServer } from "./identity-server";
import { safeNext } from "./safe-next";
export async function requireAccessServer(need: AccessLevel, next: string) {
  const { client, options } = await identityServer();
  let user: User | undefined;
  try {
    user = (await client.getSession({}, options)).user;
  } catch (error) {
    if (!(error instanceof ConnectError && error.code === Code.Unauthenticated))
      throw error;
  }
  if (!user || !canAccess(sessionLevel(user.level), need))
    redirect(
      loginHref(
        safeNext(next),
        next.startsWith("/host") ? "host" : "continue",
        need,
      ),
    );
  return user;
}
