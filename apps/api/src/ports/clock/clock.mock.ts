import type { Clock } from "./clock";
export type MockClock = Clock & {
  set(ms: number): void;
  advance(ms: number): void;
};
export function createMockClock(initial?: number): MockClock {
  let fixed = initial;
  const now = () => fixed ?? Date.now();
  function set(ms: number) {
    if (!Number.isFinite(ms)) throw new RangeError("Time must be finite.");
    fixed = ms;
  }
  return {
    now,
    today: () => new Date(now()).toISOString().slice(0, 10),
    set,
    advance: (ms) => set(now() + ms),
  };
}
