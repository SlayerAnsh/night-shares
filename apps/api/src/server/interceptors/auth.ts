import { getOption } from "@bufbuild/protobuf";
import { Code, ConnectError, type Interceptor } from "@connectrpc/connect";
import { Access, access } from "@night-shares/proto/auth/v1/access_pb";
import type { SessionStore } from "../../ports/sessions/session-store";
import { userKey } from "../auth-context";
export function createAuthInterceptor({
  sessions,
}: {
  sessions: SessionStore;
}): Interceptor {
  return (next) => async (request) => {
    const required = getOption(request.method, access);
    const token = /^Bearer ([^\s]+)$/i.exec(
      request.header.get("authorization") ?? "",
    )?.[1];
    const user = token ? sessions.get(token) : undefined;
    request.contextValues.set(userKey, user);
    if (required === Access.PUBLIC) return next(request);
    if (!user)
      throw new ConnectError("Sign in to continue.", Code.Unauthenticated);
    if (required !== Access.DEVICE && required !== Access.ORB)
      throw new ConnectError(
        "Access is not configured.",
        Code.PermissionDenied,
      );
    if (required === Access.ORB && user.level !== "orb")
      throw new ConnectError(
        "Orb verification is required.",
        Code.PermissionDenied,
      );
    return next(request);
  };
}
