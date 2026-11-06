import { expect, spyOn, test } from "bun:test";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { Code, createClient, createRouterTransport } from "@connectrpc/connect";
import { CatalogService } from "@night-shares/proto/catalog/v1/catalog_pb";
import { loadServerConfig } from "../../config/server-config";
import { applyHttpLimits } from "./http-limits";

function request() {
  const req = new IncomingMessage(new Socket());
  req.headers = {};
  const res = new ServerResponse(req);
  const end = spyOn(res, "end").mockImplementation(() => res);
  return { req, res, end };
}

test("HTTP rejects declared oversized bodies before dispatch", () => {
  const { req, res, end } = request();
  req.headers["content-length"] = "33";
  expect(
    applyHttpLimits(req, res, {
      ...loadServerConfig(),
      maxRequestBodyBytes: 32,
    }),
  ).toBe(false);
  expect(res.statusCode).toBe(413);
  expect(end).toHaveBeenCalledTimes(1);
  req.destroy();
  res.destroy();
});

test("HTTP counts chunked body bytes across chunks", () => {
  const { req, res, end } = request();
  expect(
    applyHttpLimits(req, res, {
      ...loadServerConfig(),
      maxRequestBodyBytes: 4,
    }),
  ).toBe(true);
  req.emit("data", Buffer.from("123"));
  expect(end).not.toHaveBeenCalled();
  req.emit("data", Buffer.from("45"));
  expect(res.statusCode).toBe(413);
  expect(end).toHaveBeenCalledTimes(1);
  res.emit("finish");
  expect(req.listenerCount("data")).toBe(0);
  req.destroy();
  res.destroy();
});

test("Connect rejects oversized messages without invoking business logic", async () => {
  let calls = 0;
  const client = createClient(
    CatalogService,
    createRouterTransport(
      (router) =>
        router.service(CatalogService, {
          listDestinations: () => {
            calls++;
            return {};
          },
        }),
      { router: { readMaxBytes: 32 } },
    ),
  );
  await expect(
    client.listDestinations({ text: "x".repeat(64) }),
  ).rejects.toMatchObject({ code: Code.ResourceExhausted });
  expect(calls).toBe(0);
});
