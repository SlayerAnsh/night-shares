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

test("proxy configuration defaults to no trusted peers and validates explicit ranges", () => {
  expect(loadServerConfig()).toMatchObject({
    trustedProxyHops: 1,
    trustedProxies: [],
  });
  expect(
    loadServerConfig({
      TRUSTED_PROXY_HOPS: "2",
      TRUSTED_PROXIES:
        " 127.0.0.1,10.0.0.0/8,::1,2001:db8::/32,::ffff:192.0.2.1/128 ",
    }),
  ).toMatchObject({
    trustedProxyHops: 2,
    trustedProxies: [
      "127.0.0.1",
      "10.0.0.0/8",
      "::1",
      "2001:db8::/32",
      "::ffff:192.0.2.1/128",
    ],
  });
  for (const value of ["0", "-1", "1.5", "NaN", "2147483648", ""]) {
    expect(() => loadServerConfig({ TRUSTED_PROXY_HOPS: value })).toThrow(
      "TRUSTED_PROXY_HOPS",
    );
  }
  for (const value of [
    "localhost",
    "10.0.0.1/33",
    "::1/129",
    "10.0.0.1/-1",
    "10.0.0.1/",
    "10.0.0.1/8/1",
    "10.0.0.1,",
    "fe80::1%eth0",
    "::ffff:192.0.2.1/80",
  ]) {
    expect(() => loadServerConfig({ TRUSTED_PROXIES: value })).toThrow(
      "TRUSTED_PROXIES",
    );
  }
});
