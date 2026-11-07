import { expect, test } from "bun:test";
import { createLogger } from "../server/logging/logger";
import { redactRpc, registerRpcUrls, rpcJsonReplacer } from "./redact-url";

const token = "test-token-1234567890";
const query = "query-token-1234567890";
const url = `https://rpc.invalid/v2/${token}?dkey=${query}`;

test("redaction covers nested viem fields, aggregates, cycles, and unknown endpoints", () => {
  const cause = Object.assign(new Error(`URL: ${url}`), {
    code: -32005,
    status: 429,
    shortMessage: token,
    details: query,
    metaMessages: [url, token],
    url,
  });
  const error = new AggregateError([cause], token, { cause });
  Object.assign(cause, { cause: error });
  const clean = redactRpc(error, [url]);
  expect(clean).toBeInstanceOf(Error);
  expect(clean.cause).toMatchObject({ code: -32005, status: 429 });
  const serialized = JSON.stringify(clean);
  for (const secret of [url, token, query])
    expect(serialized).not.toContain(secret);
  expect(cause.message).toContain(url);
  expect(redactRpc("https://unknown.invalid/v2/secret?key=short")).toBe(
    "https://unknown.invalid/<redacted>",
  );
});

test("logging and config JSON expose only RPC hosts", () => {
  registerRpcUrls([url]);
  const config = { arcRpcUrl: url, arcRpcUrls: [url] };
  const dump = JSON.stringify(config, rpcJsonReplacer);
  expect(JSON.parse(dump)).toEqual({
    arcRpcUrl: "rpc.invalid",
    arcRpcUrls: ["rpc.invalid"],
  });
  const lines: string[] = [];
  createLogger("info", (line) => lines.push(line)).log("error", token, {
    config,
    error: Object.assign(new Error(url), { details: query }),
  });
  for (const secret of [url, token, query])
    expect(lines.join("\n")).not.toContain(secret);
  expect(JSON.parse(lines[0] ?? "{}").config).toEqual(JSON.parse(dump));
});
