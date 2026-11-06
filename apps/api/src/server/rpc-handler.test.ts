import { expect, test } from "bun:test";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { loadServerConfig } from "../config/server-config";
import { buildContainer } from "../container/build-container";
import { applyHttpLimits } from "./limits/http-limits";
import { createRateLimits } from "./limits/rate-limit";
import { createLogger } from "./logging/logger";
import { createRpcHandler } from "./rpc-handler";

test("RPC bridge preserves body bytes and awaits work after the response closes", async () => {
  const container = buildContainer({
    port: 0,
    adapters: "mock",
    dbPath: ":memory:",
    clock: "mock",
    ids: "sequential",
  });
  const config = loadServerConfig();
  let entered = () => {};
  let release = () => {};
  const called = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  container.modules.catalog.handler.listDestinations = async (request) => {
    expect(request.text).toBe("Paris");
    entered();
    await gate;
    return { destinations: [] };
  };
  const rpc = createRpcHandler(
    container,
    config,
    createLogger("silent"),
    createRateLimits(config),
  );
  const req = new IncomingMessage(new Socket());
  req.socket = new Socket();
  req.headers = {
    host: "localhost",
    "content-type": "application/json",
    "connect-protocol-version": "1",
  };
  req.method = "POST";
  req.httpVersion = "1.1";
  req.url = "/night_shares.catalog.v1.CatalogService/ListDestinations";
  const res = new ServerResponse(req);
  Object.defineProperty(res, "destroyed", { value: true });
  applyHttpLimits(req, res, config);
  req.push(Buffer.from('{"text":"Paris"}'));
  req.push(null);
  let finished = false;
  const pending = rpc.handle(req.url, req, res).then(() => {
    finished = true;
  });
  try {
    await called;
    expect(finished).toBe(false);
    release();
    await pending;
    expect(finished).toBe(true);
  } finally {
    release();
    res.emit("close");
    req.destroy();
    container.ports.db.close();
  }
});
