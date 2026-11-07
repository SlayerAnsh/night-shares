import {
  ConnectError,
  createContextKey,
  type Interceptor,
} from "@connectrpc/connect";
import { redactRpc } from "../../shared/redact-url";
import { userKey } from "../auth-context";
import type { Logger } from "./logger";

export const rpcLoggedKey = createContextKey(false);

export function createLoggingInterceptor(
  logger: Logger,
  now = () => performance.now(),
): Interceptor {
  return (next) => async (request) => {
    request.contextValues.set(rpcLoggedKey, true);
    const started = now();
    let code = "OK";
    try {
      return await next(request);
    } catch (error) {
      code = String(ConnectError.from(error).code);
      // Rethrow the original: a redacted copy is not recognised as a
      // ConnectError downstream. The errors interceptor redacts client text.
      throw error;
    } finally {
      if (code === "OK" && request.signal.aborted)
        code = String(ConnectError.from(request.signal.reason).code);
      logger.log(
        "info",
        "rpc",
        redactRpc({
          method: `${request.service.typeName}/${request.method.name}`,
          code,
          durationMs: Math.max(0, now() - started),
          userId: request.contextValues.get(userKey)?.id,
        }),
      );
    }
  };
}
