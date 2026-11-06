import { normalizeIpKey } from "./ip-address";

export function createTokenBucket(options: {
  capacity: number;
  windowMs: number;
  maxBuckets: number;
  now: () => number;
}) {
  const buckets = new Map<string, { tokens: number; at: number }>();
  return {
    take(key: string): boolean {
      key = normalizeIpKey(key);
      const now = options.now();
      let bucket = buckets.get(key);
      if (!bucket) {
        // Reclaim stale buckets first, then evict the least recently used key.
        if (buckets.size >= options.maxBuckets) {
          for (const [key, value] of buckets) {
            if (now - value.at >= options.windowMs) buckets.delete(key);
          }
          if (buckets.size >= options.maxBuckets) {
            const oldest = buckets.keys().next().value;
            if (oldest !== undefined) buckets.delete(oldest);
          }
        }
        bucket = { tokens: options.capacity, at: now };
      }
      // Refresh recency on every attempt, including exhausted buckets.
      buckets.delete(key);
      buckets.set(key, bucket);
      bucket.tokens = Math.min(
        options.capacity,
        bucket.tokens +
          (Math.max(0, now - bucket.at) * options.capacity) / options.windowMs,
      );
      bucket.at = now;
      if (bucket.tokens < 1) return false;
      bucket.tokens -= 1;
      return true;
    },
  };
}
