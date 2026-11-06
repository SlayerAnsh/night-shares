import { expect, test } from "bun:test";
import { loadServerConfig } from "./server-config";

test("server defaults enable limits and restrict CORS", () => {
  expect(loadServerConfig()).toMatchObject({
    rateLimitEnabled: true,
    trustProxy: false,
    maxRequestBodyBytes: 65536,
    corsOrigins: ["http://localhost:3000"],
  });
  expect(
    loadServerConfig({
      CORS_ORIGINS: "https://example.test,http://localhost:4000",
    }).corsOrigins,
  ).toHaveLength(2);
});

test("invalid server configuration fails before listening", () => {
  for (const [key, value] of Object.entries({
    LOG_LEVEL: "all",
    TRUST_PROXY: "1",
    RATE_LIMIT_ENABLED: "no",
    RATE_LIMIT_PER_IP: "0",
    MAX_REQUEST_BODY_BYTES: "-1",
    REQUEST_TIMEOUT_MS: "Infinity",
    SHUTDOWN_TIMEOUT_MS: "2147483648",
    CORS_ORIGINS: "*",
  })) {
    expect(() => loadServerConfig({ [key]: value })).toThrow(key);
  }
});
