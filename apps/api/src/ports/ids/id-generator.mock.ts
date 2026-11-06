import type { IdGenerator } from "./id-generator";
export function createMockIdGenerator(): IdGenerator {
  const counters = new Map<string, number>();
  return {
    next(prefix) {
      const count = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, count);
      return `${prefix}_${String(count).padStart(4, "0")}`;
    },
  };
}
