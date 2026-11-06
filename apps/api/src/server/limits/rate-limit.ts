import { Code, ConnectError, type Interceptor } from "@connectrpc/connect";
import type { ServerConfig } from "../../config/server-config";
import { userKey } from "../auth-context";
import { createTokenBucket } from "./token-bucket";

export const rateLimitMessage = "Too many requests. Please try again shortly.";
export function createRateLimits(
  config: ServerConfig,
  now = () => performance.now(),
) {
  const bucket = (capacity: number) =>
    createTokenBucket({
      capacity,
      windowMs: config.rateLimitWindowMs,
      maxBuckets: config.rateLimitMaxBuckets,
      now,
    });
  const ip = bucket(config.rateLimitPerIp);
  const user = bucket(config.rateLimitPerUser);
  const identityIp = bucket(config.rateLimitIdentity);
  const identityUser = bucket(config.rateLimitIdentity);
  const sensitive = new Set(["StartSignIn", "CompleteSignIn", "VerifyAction"]);
  const isIdentity = (path: string) => {
    const [service, method] = path.replace(/^\//, "").split("/");
    return (
      service === "night_shares.identity.v1.IdentityService" &&
      sensitive.has(method ?? "")
    );
  };
  const interceptor: Interceptor = (next) => async (request) => {
    const id = request.contextValues.get(userKey)?.id;
    if (
      config.rateLimitEnabled &&
      id &&
      (!user.take(id) ||
        (isIdentity(`${request.service.typeName}/${request.method.name}`) &&
          !identityUser.take(id)))
    )
      throw new ConnectError(rateLimitMessage, Code.ResourceExhausted);
    return next(request);
  };
  return {
    allowIp(address: string, path: string) {
      return (
        !config.rateLimitEnabled ||
        (ip.take(address) && (!isIdentity(path) || identityIp.take(address)))
      );
    },
    interceptor,
  };
}
