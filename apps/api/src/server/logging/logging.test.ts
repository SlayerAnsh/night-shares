import { expect, test } from "bun:test";
import {
  Code,
  ConnectError,
  createClient,
  createRouterTransport,
  type Interceptor,
} from "@connectrpc/connect";
import { CatalogService } from "@night-shares/proto/catalog/v1/catalog_pb";
import { loadServerConfig } from "../../config/server-config";
import { DomainError } from "../../shared/errors/domain-error";
import { userKey } from "../auth-context";
import { createErrorsInterceptor } from "../interceptors/errors";
import { createRateLimits } from "../limits/rate-limit";
import { createLogger } from "./logger";
import { createLoggingInterceptor } from "./rpc";

function fixture() {
  const lines: string[] = [];
  const logger = createLogger("info", (line) => lines.push(line));
  let failure: unknown;
  let userId = "usr_1";
  const auth: Interceptor = (next) => async (request) => {
    request.contextValues.set(userKey, {
      id: userId,
      humanId: "private",
      walletAddress: "private",
      level: "device",
    });
    return next(request);
  };
  const limits = createRateLimits(
    { ...loadServerConfig(), rateLimitPerUser: 2 },
    () => 0,
  );
  const client = createClient(
    CatalogService,
    createRouterTransport(
      (router) =>
        router.service(CatalogService, {
          listDestinations: () => {
            if (failure) throw failure;
            return {};
          },
        }),
      {
        router: {
          interceptors: [
            createLoggingInterceptor(logger, () => 123),
            createErrorsInterceptor(logger),
            auth,
            limits.interceptor,
          ],
        },
      },
    ),
  );
  return {
    client,
    lines,
    fail: (error: unknown) => {
      failure = error;
    },
    user: (id: string) => {
      userId = id;
    },
  };
}

test("RPC logs contain method, code, duration and user ID without headers or payload", async () => {
  const f = fixture();
  await f.client.listDestinations(
    { text: "private@example.test" },
    { headers: { authorization: "Bearer private-token" } },
  );
  expect(JSON.parse(f.lines[0] ?? "{}")).toMatchObject({
    event: "rpc",
    code: "OK",
    durationMs: 0,
    userId: "usr_1",
    method: "night_shares.catalog.v1.CatalogService/ListDestinations",
  });
  expect(f.lines.join("")).not.toContain("private");
});

test("unexpected errors produce one sanitized stack and a generic client error", async () => {
  const f = fixture();
  f.fail(new Error("private-token private@example.test"));
  await expect(f.client.listDestinations({})).rejects.toMatchObject({
    code: Code.Internal,
    rawMessage: "An unexpected error occurred.",
  });
  expect(
    f.lines.filter((line) => JSON.parse(line).event === "unexpected_error"),
  ).toHaveLength(1);
  expect(JSON.parse(f.lines[0] ?? "{}").stack).toContain("at ");
  expect(f.lines.join("")).not.toContain("private-token");
  expect(f.lines.join("")).not.toContain("private@example.test");
});

test("domain and Connect errors remain expected and do not emit stacks", async () => {
  for (const error of [
    new DomainError("NOT_FOUND", "Not found."),
    new ConnectError("Not found.", Code.NotFound),
  ]) {
    const f = fixture();
    f.fail(error);
    await expect(f.client.listDestinations({})).rejects.toMatchObject({
      code: Code.NotFound,
    });
    expect(f.lines).toHaveLength(1);
    expect(f.lines[0]).not.toContain("stack");
  }
});

test("user quotas apply across requests and isolate users", async () => {
  const f = fixture();
  await f.client.listDestinations({});
  await f.client.listDestinations({});
  await expect(f.client.listDestinations({})).rejects.toMatchObject({
    code: Code.ResourceExhausted,
  });
  f.user("usr_2");
  await f.client.listDestinations({});
});

test("LOG_LEVEL filters JSON lines", () => {
  const lines: string[] = [];
  const logger = createLogger("warn", (line) => lines.push(line));
  logger.log("info", "hidden");
  logger.log("warn", "visible");
  expect(lines).toHaveLength(1);
  createLogger("silent", (line) => lines.push(line)).log("error", "hidden");
  expect(lines).toHaveLength(1);
});

test("RPC clients and logs redact expected and unexpected endpoint errors", async () => {
  const { registerRpcUrls } = await import("../../shared/redact-url");
  const secret = "rpc-client-secret-123456789";
  const url = `https://rpc.invalid/v2/${secret}?dkey=${secret}`;
  registerRpcUrls([url]);
  for (const error of [
    new Error(url),
    new DomainError("NOT_FOUND", `${url} ${secret}`),
    new ConnectError(`${url} ${secret}`, Code.Unavailable),
  ]) {
    const f = fixture();
    f.fail(error);
    let failure: unknown;
    try {
      await f.client.listDestinations({});
    } catch (caught) {
      failure = caught;
    }
    expect(failure).toBeInstanceOf(ConnectError);
    expect(
      `${String(failure)} ${JSON.stringify(failure)} ${f.lines.join("\n")}`,
    ).not.toContain(secret);
  }
});
