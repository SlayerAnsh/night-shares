import { createServer as createHttpServer } from "node:http";
import { loadServerConfig, type ServerConfig } from "../config/server-config";
import type { Container } from "../container/build-container";
import { redactRpc } from "../shared/redact-url";
import { createAgentPassRoute } from "./agent-pass-route";
import { serveDocs } from "./docs/serve-docs";
import { clientIp } from "./limits/client-ip";
import { applyHttpLimits, rejectRequest } from "./limits/http-limits";
import { createRateLimits, rateLimitMessage } from "./limits/rate-limit";
import { createLogger } from "./logging/logger";
import { createReadiness } from "./readiness";
import { createRpcHandler } from "./rpc-handler";

export function createServer(
  container: Container,
  options: Partial<ServerConfig> = {},
) {
  const config = { ...loadServerConfig(), ...options };
  const logger = createLogger(config.logLevel);
  const limits = createRateLimits(config);
  const ready = createReadiness(container.ports.db);
  const rpc = createRpcHandler(container, config, logger, limits);
  const agentPass = createAgentPassRoute(container);
  let draining = false;
  const pending = new Set<Promise<void>>();
  const server = createHttpServer((req, res) => {
    const started = performance.now();
    const path = (req.url ?? "/").split("?")[0] ?? "/";
    const isRpc = rpc.has(path) && req.method !== "OPTIONS";
    let rpcStarted = false;
    res.once("finish", () => {
      if (isRpc && rpcStarted) return;
      logger.log("info", isRpc ? "rpc" : "http", {
        method: isRpc ? path.slice(1) : req.method,
        route: isRpc
          ? undefined
          : ["/healthz", "/readyz", "/docs", "/docs/"].includes(path)
            ? path
            : "other",
        code: isRpc ? `HTTP_${res.statusCode}` : res.statusCode,
        durationMs: performance.now() - started,
      });
    });
    res.setHeader("vary", "Origin");
    const origin = req.headers.origin;
    if (origin && config.corsOrigins.includes(origin)) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
      res.setHeader(
        "access-control-allow-headers",
        "Content-Type, Authorization, Connect-Protocol-Version, Connect-Timeout-Ms, X-User-Agent",
      );
      res.setHeader(
        "access-control-expose-headers",
        "Grpc-Status, Grpc-Message, Grpc-Status-Details-Bin",
      );
    }
    const handle = async () => {
      if (draining) {
        rejectRequest(res, 503, "unavailable", "Server is shutting down.");
        return;
      }
      if (!applyHttpLimits(req, res, config)) return;
      // Probes do not consume application quotas, so monitoring cannot exhaust them.
      if (req.method === "GET" && (path === "/healthz" || path === "/readyz")) {
        const reason =
          path === "/readyz"
            ? await container.ports.chainReadiness?.()
            : undefined;
        const healthy = path === "/healthz" || (ready() && !reason);
        res
          .writeHead(healthy ? 200 : 503, {
            "content-type": "application/json",
          })
          .end(
            JSON.stringify({
              status: healthy ? "ok" : "unavailable",
              ...(reason ? { reason: redactRpc(reason) } : {}),
            }),
          );
        return;
      }
      if (
        !limits.allowIp(
          clientIp(
            req.socket.remoteAddress,
            req.headers["x-forwarded-for"],
            config.trustProxy,
            config.trustedProxyHops,
            config.trustedProxies,
          ),
          path,
        )
      ) {
        rejectRequest(res, 429, "resource_exhausted", rateLimitMessage);
        return;
      }
      if (req.method === "OPTIONS") {
        res.writeHead(204).end();
        return;
      }
      if (isRpc) {
        const timeout = req.headers["connect-timeout-ms"];
        if (
          timeout === undefined ||
          (typeof timeout === "string" &&
            /^\d+$/.test(timeout) &&
            Number(timeout) > config.requestTimeoutMs)
        )
          req.headers["connect-timeout-ms"] = String(config.requestTimeoutMs);
        rpcStarted = true;
        await rpc.handle(path, req, res);
        return;
      }
      if (await agentPass(req, res)) return;
      if (await serveDocs(req, res)) return;
      res.writeHead(404).end();
    };
    const task = handle()
      .catch((error: unknown) => {
        logger.unexpected(error);
        rejectRequest(res, 500, "internal", "An unexpected error occurred.");
      })
      .finally(() => pending.delete(task));
    pending.add(task);
  });
  server.requestTimeout = config.requestTimeoutMs;
  server.headersTimeout = Math.min(config.requestTimeoutMs, 10_000);
  server.timeout = config.requestTimeoutMs;
  server.keepAliveTimeout = 5_000;
  return Object.assign(server, {
    beginShutdown() {
      draining = true;
    },
    async drain() {
      await Promise.all([...pending]);
    },
  });
}
