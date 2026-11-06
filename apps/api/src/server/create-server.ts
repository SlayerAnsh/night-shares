import { createServer as createHttpServer } from "node:http";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import type { Container } from "../container/build-container";
import { serveDocs } from "./docs/serve-docs";
import { createAuthInterceptor } from "./interceptors/auth";
import { errors } from "./interceptors/errors";
import { registerRoutes } from "./routes";
export function createServer(container: Container) {
  const connect = connectNodeAdapter({
    routes: (router) => registerRoutes(router, container.modules),
    interceptors: [errors, createAuthInterceptor(container.ports)],
  });
  return createHttpServer(async (req, res) => {
    res.setHeader("vary", "Origin");
    if (req.headers.origin === "http://localhost:3000") {
      res.setHeader("access-control-allow-origin", "http://localhost:3000");
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
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    if (req.method === "GET" && req.url === "/healthz") {
      res
        .writeHead(200, { "content-type": "application/json" })
        .end('{"status":"ok"}');
      return;
    }
    try {
      if (await serveDocs(req, res)) return;
    } catch (error) {
      console.error("Failed to serve API documentation", error);
      res.writeHead(500).end("Documentation unavailable");
      return;
    }
    await connect(req, res);
  });
}
