import type { IncomingMessage, ServerResponse } from "node:http";
import { createConnectRouter, createContextValues } from "@connectrpc/connect";
import {
  compressionBrotli,
  compressionGzip,
  universalRequestFromNodeRequest,
} from "@connectrpc/connect-node";
import type { ServerConfig } from "../config/server-config";
import type { Container } from "../container/build-container";
import { createAuthInterceptor } from "./interceptors/auth";
import { createErrorsInterceptor } from "./interceptors/errors";
import type { createRateLimits } from "./limits/rate-limit";
import type { Logger } from "./logging/logger";
import { createLoggingInterceptor, rpcLoggedKey } from "./logging/rpc";
import { registerRoutes } from "./routes";
import { writeRpcResponse } from "./write-rpc-response";

export function createRpcHandler(
  container: Container,
  config: ServerConfig,
  logger: Logger,
  limits: ReturnType<typeof createRateLimits>,
) {
  const router = createConnectRouter({
    readMaxBytes: Math.min(
      config.connectReadMaxBytes,
      config.maxRequestBodyBytes,
    ),
    maxTimeoutMs: config.requestTimeoutMs,
    acceptCompression: [compressionGzip, compressionBrotli],
    interceptors: [
      createLoggingInterceptor(logger),
      createErrorsInterceptor(logger),
      createAuthInterceptor(container.ports),
      limits.interceptor,
    ],
  });
  registerRoutes(router, container.modules);
  const handlers = new Map(
    router.handlers.map((handler) => [handler.requestPath, handler]),
  );
  return {
    has(path: string) {
      return handlers.has(path);
    },
    async handle(path: string, req: IncomingMessage, res: ServerResponse) {
      const handler = handlers.get(path);
      if (!handler) {
        res.writeHead(404).end();
        return;
      }
      const values = createContextValues();
      const started = performance.now();
      const response = await handler(
        universalRequestFromNodeRequest(req, res, undefined, values),
      );
      // The stock adapter returns void and hides its promise. Await the public
      // bridge so shutdown includes work continuing after client cancellation.
      if (!res.writableEnded && !res.destroyed)
        await writeRpcResponse(response, res);
      if (!values.get(rpcLoggedKey))
        logger.log("info", "rpc", {
          method: `${handler.service.typeName}/${handler.method.name}`,
          code: `HTTP_${response.status}`,
          durationMs: performance.now() - started,
        });
    },
  };
}
