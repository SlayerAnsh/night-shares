import type { NightRecord } from "../inventory-repo";
// Retain the curve and outstanding obligations; callers reject further sales while stopped.
export function stop(record: NightRecord): NightRecord {
  return { ...record, stopped: true };
}
