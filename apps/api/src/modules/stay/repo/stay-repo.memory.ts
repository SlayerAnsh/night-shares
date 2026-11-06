import type { StayRepo } from "./stay-repo";
export function createMemoryStayRepo(): StayRepo {
  return {
    quotes: new Map(),
    locks: new Map(),
    trips: new Map(),
    saves: new Map(),
  };
}
