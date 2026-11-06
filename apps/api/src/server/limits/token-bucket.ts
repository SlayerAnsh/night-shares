import { normalizeIpKey } from "./ip-address";

type Bucket = { tokens: number; at: number };

export function createTokenBucket(options: {
  capacity: number;
  windowMs: number;
  maxBuckets: number;
  now: () => number;
  ipv6Prefix?: 48 | 64;
}) {
  const buckets = new Map<string, Bucket>();
  const overflowCapacity = Math.max(1, Math.floor(options.capacity / 10));
  let overflow: Bucket | undefined;
  const refilledTokens = (bucket: Bucket, capacity: number, now: number) =>
    Math.min(
      capacity,
      bucket.tokens +
        (Math.max(0, now - bucket.at) * capacity) / options.windowMs,
    );
  const charge = (bucket: Bucket, capacity: number, now: number) => {
    bucket.tokens = refilledTokens(bucket, capacity, now);
    bucket.at = now;
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  };
  return {
    take(key: string): boolean {
      key = normalizeIpKey(key, options.ipv6Prefix);
      const now = options.now();
      let bucket = buckets.get(key);
      if (!bucket) {
        if (buckets.size >= options.maxBuckets) {
          for (const [key, value] of buckets) {
            if (now - value.at >= options.windowMs) buckets.delete(key);
          }
          if (buckets.size >= options.maxBuckets) {
            // Map order is LRU order. Only fully refilled buckets are safe to evict.
            for (const [key, value] of buckets) {
              if (
                refilledTokens(value, options.capacity, now) ===
                options.capacity
              ) {
                buckets.delete(key);
                break;
              }
            }
          }
          if (buckets.size >= options.maxBuckets) {
            overflow ??= { tokens: overflowCapacity, at: now };
            return charge(overflow, overflowCapacity, now);
          }
        }
        bucket = { tokens: options.capacity, at: now };
      }
      // Refresh recency on every attempt, including exhausted buckets.
      buckets.delete(key);
      buckets.set(key, bucket);
      return charge(bucket, options.capacity, now);
    },
  };
}
