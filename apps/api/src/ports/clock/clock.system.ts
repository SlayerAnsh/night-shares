import type { Clock } from "./clock";
export function createSystemClock(today?: string): Clock {
  return {
    now: () => Date.now(),
    today: () => today ?? new Date().toISOString().slice(0, 10),
  };
}
