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

test("throttled buckets survive a flood of new keys", () => {
  const bucket = createTokenBucket({
    capacity: 2,
    windowMs: 1000,
    maxBuckets: 1,
    now: () => 0,
  });
  expect(bucket.take("client")).toBe(true);
  expect(bucket.take("client")).toBe(true);
  expect(bucket.take("client")).toBe(false);
  for (let i = 0; i < 1000; i++) {
    expect(bucket.take(`attacker-${i}`)).toBe(i === 0);
    expect(bucket.take("client")).toBe(false);
  }
});

test("eviction skips throttled entries and chooses the least recent refilled bucket", () => {
  let now = 0;
  const bucket = createTokenBucket({
    capacity: 10,
    windowMs: 1000,
    maxBuckets: 3,
    now: () => now,
  });
  for (let i = 0; i < 10; i++) expect(bucket.take("throttled")).toBe(true);
  expect(bucket.take("first")).toBe(true);
  expect(bucket.take("second")).toBe(true);
  now = 100;
  expect(bucket.take("new")).toBe(true);
  // The retained refilled bucket still has its full quota.
  for (let i = 0; i < 10; i++) expect(bucket.take("second")).toBe(true);
  expect(bucket.take("second")).toBe(false);
  // The evicted key must now use overflow, since no bucket is full.
  expect(bucket.take("first")).toBe(true);
  expect(bucket.take("first")).toBe(false);
  expect(bucket.take("throttled")).toBe(true);
  expect(bucket.take("throttled")).toBe(false);
});

test("overflow shares a reduced continuously refilling quota without storing new keys", () => {
  let now = 0;
  const bucket = createTokenBucket({
    capacity: 25,
    windowMs: 1000,
    maxBuckets: 1,
    now: () => now,
  });
  for (let i = 0; i < 25; i++) expect(bucket.take("existing")).toBe(true);
  expect(bucket.take("new-a")).toBe(true);
  expect(bucket.take("new-b")).toBe(true);
  expect(bucket.take("new-c")).toBe(false);
  now = 250;
  expect(bucket.take("new-d")).toBe(false);
  now = 500;
  expect(bucket.take("new-e")).toBe(true);
  expect(bucket.take("new-a")).toBe(false);
  // Existing clients retain their own refill budget.
  for (let i = 0; i < 12; i++) expect(bucket.take("existing")).toBe(true);
  expect(bucket.take("existing")).toBe(false);
  now = 1500;
  // Stale cleanup allows a former overflow client its normal quota.
  for (let i = 0; i < 25; i++) expect(bucket.take("new-a")).toBe(true);
  expect(bucket.take("new-a")).toBe(false);
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

test("identity IP limits group IPv6 by /48 while general limits retain /64", () => {
  const limits = createRateLimits(
    {
      ...loadServerConfig(),
      rateLimitEnabled: true,
      rateLimitPerIp: 2,
      rateLimitIdentity: 1,
      rateLimitMaxBuckets: 10,
    },
    () => 0,
  );
  const path = "/night_shares.identity.v1.IdentityService/";
  expect(limits.allowIp("2001:db8:1234:1::1", `${path}StartSignIn`)).toBe(true);
  expect(limits.allowIp("2001:0DB8:1234:ffff::2", `${path}VerifyAction`)).toBe(
    false,
  );
  expect(limits.allowIp("2001:db8:1235:1::1", `${path}CompleteSignIn`)).toBe(
    true,
  );
  expect(limits.allowIp("2001:db8:1234:2::1", "/catalog")).toBe(true);
  expect(limits.allowIp("2001:db8:1234:2::2", "/catalog")).toBe(true);
  expect(limits.allowIp("2001:db8:1234:2::3", "/catalog")).toBe(false);
});
