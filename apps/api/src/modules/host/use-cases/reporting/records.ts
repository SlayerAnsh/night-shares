import { addDays } from "../../../../shared/dates";
import type { HostDeps } from "../deps";
import { propertyOf } from "../property";
export function recordsFor(
  deps: HostDeps,
  userId: string,
  propertyId: string,
  start: string,
  days: number,
) {
  const p = propertyOf(deps, userId, propertyId);
  // The demo uses shared market seeds. Host-only random gaps or half allotments
  // would overwrite bookings and trader obligations visible in other domains.
  return Array.from({ length: days }, (_, i) => addDays(start, i)).flatMap(
    (date) =>
      p.roomTypes.map((r) =>
        deps.ports.inventory.get(`${p.id}:${r.id}:${date}`),
      ),
  );
}
