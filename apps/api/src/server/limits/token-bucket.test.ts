import { expect, test } from "bun:test";
import { loadServerConfig } from "../../config/server-config";
import { createRateLimits } from "./rate-limit";
import { createTokenBucket } from "./token-bucket";

test("buckets isolate keys and refill continuously", () => {
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
  now = 500;
  expect(bucket.take("a")).toBe(true);
  expect(bucket.take("a")).toBe(false);
  now = 1500;
  expect(bucket.take("a")).toBe(true);
});

test("full maps admit new clients and evict the least recently touched key", () => {
  const bucket = createTokenBucket({
    capacity: 1,
    windowMs: 1000,
    maxBuckets: 2,
    now: () => 0,
  });
  expect(bucket.take("a")).toBe(true);
  expect(bucket.take("b")).toBe(true);
  expect(bucket.take("a")).toBe(false);
  expect(bucket.take("c")).toBe(true);
  expect(bucket.take("a")).toBe(false);
  expect(bucket.take("b")).toBe(true);
});

test("stale entries are reclaimed before an active LRU key", () => {
  let now = 0;
  const bucket = createTokenBucket({
    capacity: 2,
    windowMs: 1000,
    maxBuckets: 2,
    now: () => now,
  });
  expect(bucket.take("a")).toBe(true);
  expect(bucket.take("b")).toBe(true);
  now = 500;
  expect(bucket.take("a")).toBe(true);
  now = 1000;
  expect(bucket.take("c")).toBe(true);
  expect(bucket.take("a")).toBe(true);
  expect(bucket.take("a")).toBe(true);
  expect(bucket.take("a")).toBe(false);
});

test("IPv6 variants in one /64 share quotas but adjacent /64s remain separate", () => {
  const bucket = createTokenBucket({
    capacity: 1,
    windowMs: 1000,
    maxBuckets: 10,
    now: () => 0,
  });
  expect(bucket.take("2001:db8:1234:5678::1")).toBe(true);
  expect(bucket.take("2001:0DB8:1234:5678:ffff:0000:0000:0002")).toBe(false);
  expect(bucket.take("2001:db8:1234:5679::1")).toBe(true);
  expect(bucket.take("192.0.2.1")).toBe(true);
  expect(bucket.take("::ffff:192.0.2.1")).toBe(false);
  expect(bucket.take("::FFFF:c000:201")).toBe(false);
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
