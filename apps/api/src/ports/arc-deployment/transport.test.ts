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
