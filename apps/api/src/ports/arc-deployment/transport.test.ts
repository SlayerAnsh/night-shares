import { expect, test } from "bun:test";
import { createPublicClient } from "viem";
import { arcTransport } from "./transport";

test("RPC rotates and backs off on HTTP 429, 5xx and Arc -32014", async () => {
  const calls: string[] = [],
    waits: number[] = [];
  let count = 0;
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(input).replace(/\/$/, ""));
    const { id } = JSON.parse(String(init?.body));
    count++;
    if (count === 1) return new Response("rate limit", { status: 429 });
    if (count === 2) return new Response("unavailable", { status: 503 });
    return Response.json(
      count === 3
        ? { jsonrpc: "2.0", id, error: { code: -32014, message: "limit" } }
        : { jsonrpc: "2.0", id, result: "0x4cef52" },
    );
  }) as typeof fetch;
  const client = createPublicClient({
    transport: arcTransport(["https://one.invalid", "https://two.invalid"], {
      fetchFn,
      wait: async (ms) => {
        waits.push(ms);
      },
    }),
  });
  expect(await client.getChainId()).toBe(5042002);
  expect(calls).toEqual([
    "https://one.invalid",
    "https://two.invalid",
    "https://one.invalid",
    "https://two.invalid",
  ]);
  expect(waits).toEqual([250, 500, 1000]);
});
test("RPC contract errors are not retried", async () => {
  let count = 0;
  const fetchFn = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    count++;
    return Response.json({
      jsonrpc: "2.0",
      id: JSON.parse(String(init?.body)).id,
      error: { code: 3, message: "execution reverted" },
    });
  }) as typeof fetch;
  const client = createPublicClient({
    transport: arcTransport(["https://one.invalid"], { fetchFn }),
  });
  await expect(client.getChainId()).rejects.toThrow();
  expect(count).toBe(1);
});

test("RPC failures redact endpoint credentials through viem and logging", async () => {
  const { createLogger } = await import("../../server/logging/logger");
  const { retryableRpcError } = await import("./transport");
  const pathToken = "path-secret-123456789";
  const queryToken = "query-secret-987654321";
  const url = `https://rpc.invalid/v2/${pathToken}?dkey=${queryToken}`;
  for (const status of [500, 429, 0]) {
    const client = createPublicClient({
      transport: arcTransport([url], {
        retries: 0,
        fetchFn: (async (_input: RequestInfo | URL) => {
          if (!status) throw new Error(`Network failed: ${url} ${pathToken}`);
          return new Response(`Failed ${url} ${queryToken}`, { status });
        }) as typeof fetch,
      }),
    });
    let failure: unknown;
    try {
      await client.getChainId();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(retryableRpcError(failure)).toBe(status !== 0);
    const lines: string[] = [];
    const logger = createLogger("debug", (line) => lines.push(line));
    logger.unexpected(failure);
    logger.log("error", "rpc_failure", { error: failure });
    const output = `${String(failure)} ${(failure as Error).stack} ${JSON.stringify(failure)} ${lines.join("\n")}`;
    for (const secret of [url, pathToken, queryToken])
      expect(output).not.toContain(secret);
    expect(output).toContain("<redacted-rpc>");
  }
});

test("readyz body cannot expose a sanitized transport failure", async () => {
  const { buildContainer } = await import("../../container/build-container");
  const { EventEmitter } = await import("node:events");
  const { IncomingMessage } = await import("node:http");
  const { Socket } = await import("node:net");
  const { createServer } = await import("../../server/create-server");
  const secret = "readyz-rpc-secret-123456789";
  const url = `https://rpc.invalid/v2/${secret}?dkey=${secret}`;
  const client = createPublicClient({
    transport: arcTransport([url], {
      retries: 0,
      fetchFn: (async (_input: RequestInfo | URL) =>
        new Response(`Failed ${url}`, { status: 500 })) as typeof fetch,
    }),
  });
  const container = buildContainer({
    port: 0,
    adapters: "mock",
    dbPath: ":memory:",
  });
  container.ports.chainReadiness = async () => {
    try {
      await client.getChainId();
      return undefined;
    } catch (error) {
      return String(error);
    }
  };
  const server = createServer(container, {
    rateLimitEnabled: false,
    logLevel: "silent",
  });
  const request = new IncomingMessage(new Socket());
  request.headers = {};
  request.method = "GET";
  request.url = "/readyz";
  let status = 0;
  try {
    const body = await new Promise<string>((resolve) => {
      const response = Object.assign(new EventEmitter(), {
        setHeader() {},
        writeHead(code: number) {
          status = code;
          return this;
        },
        end(body: string) {
          resolve(body);
        },
      });
      server.emit("request", request, response);
    });
    expect(status).toBe(503);
    expect(body).toContain("<redacted-rpc>");
    expect(body).not.toContain(secret);
    expect(body).not.toContain(url);
  } finally {
    await server.drain();
    container.ports.db.close();
  }
});
