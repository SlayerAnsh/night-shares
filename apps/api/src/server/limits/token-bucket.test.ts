import { expect, test } from "bun:test";
import { loadServerConfig } from "../../config/server-config";
import { clientIp } from "./client-ip";
import { createRateLimits } from "./rate-limit";
import { createTokenBucket } from "./token-bucket";

test("buckets isolate keys, refill continuously and bound memory without resetting quotas", () => {
  let now = 0;
  const bucket = createTokenBucket({
    capacity: 2,
    windowMs: 1000,
    maxBuckets: 2,
    now: () => now,
  });
  expect(bucket.take("a")).toBe(true);
  expect(bucket.take("a")).toBe(true);
  expect(bucket.take("a")).toBe(false);
  expect(bucket.take("b")).toBe(true);
  expect(bucket.take("c")).toBe(false);
  now = 500;
  expect(bucket.take("a")).toBe(true);
  expect(bucket.take("a")).toBe(false);
  now = 1500;
  expect(bucket.take("c")).toBe(true);
});

test("forwarded IPs require explicit proxy trust and valid IP syntax", () => {
  expect(clientIp("127.0.0.1", "203.0.113.7, 10.0.0.1", false)).toBe(
    "127.0.0.1",
  );
  expect(clientIp("127.0.0.1", "203.0.113.7, 10.0.0.1", true)).toBe(
    "203.0.113.7",
  );
  expect(clientIp("127.0.0.1", "invented-key", true)).toBe("127.0.0.1");
});

test("sensitive identity methods share stricter IP budget; general budget remains separate", () => {
  const limits = createRateLimits(
    { ...loadServerConfig(), rateLimitIdentity: 1 },
    () => 0,
  );
  const path = "/night_shares.identity.v1.IdentityService/";
  expect(limits.allowIp("a", `${path}StartSignIn`)).toBe(true);
  expect(limits.allowIp("a", `${path}CompleteSignIn`)).toBe(false);
  expect(limits.allowIp("a", `${path}VerifyAction`)).toBe(false);
  expect(limits.allowIp("b", `${path}StartSignIn`)).toBe(true);
  expect(limits.allowIp("a", "/catalog")).toBe(true);
  const disabled = createRateLimits({
    ...loadServerConfig(),
    rateLimitEnabled: false,
    rateLimitPerIp: 1,
  });
  for (let i = 0; i < 500; i++)
    expect(disabled.allowIp("a", `${path}StartSignIn`)).toBe(true);
});
