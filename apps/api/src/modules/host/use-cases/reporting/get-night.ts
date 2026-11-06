import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import { addDays, parseDate } from "../../../../shared/dates";
import { mapNight, releaseMs } from "../../mappers/night";
import { payoutOf } from "../../mappers/payout";
import type { HostDeps } from "../deps";
import { recordsFor } from "./records";
export function createGetNight(deps: HostDeps) {
  return (userId: string, propertyId: string, date: string) => {
    parseDate(date);
    const records = recordsFor(deps, userId, propertyId, date, 1);
    const keys = new Set(records.map((r) => r.key));
    const activity = deps.ports.activity
      .list({ propertyId })
      .filter((e) => keys.has(e.nightKey))
      .map((e) => ({
        at: timestampFromMs(e.at),
        kind: e.kind,
        size: { tenths: e.tenths },
        amount: { micros: e.priceMicros ?? 0n },
      }));
    const timeline = records.flatMap((r) => [
      { ms: r.openedAt, description: `${r.roomTypeId}: Opened` },
      {
        ms: releaseMs(date, deps.repo.release(r.key)),
        description: `${r.roomTypeId}: Unsold rooms return to hotel inventory`,
      },
    ]);
    timeline.push(
      { ms: parseDate(date) + 15 * 3_600_000, description: "Guests check in" },
      {
        ms: parseDate(addDays(date, 1)) + 11 * 3_600_000,
        description:
          "The night closes. Your occupancy report updates your track record.",
      },
    );
    return {
      roomTypes: records.map((r) => mapNight(r, deps.repo)),
      activity,
      releaseTimeline: timeline
        .sort((a, b) => a.ms - b.ms)
        .map((e) => ({
          at: timestampFromMs(e.ms),
          description: e.description,
        })),
      payout: payoutOf(records),
    };
  };
}
