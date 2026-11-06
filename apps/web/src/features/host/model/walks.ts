import type { WalkIncident } from "@night-shares/proto/catalog/v1/property_pb";

// Two valid walk incidents on the host's record suspend new openings.
export const WALK_LIMIT = 2;

export const WALK_RULE =
  "If a guest with a booking is turned away, you refund what they paid in full, from your pending payouts first.";
export const SCAN_NOTE =
  "Scan every Night Shares guest with World ID at check-in. It is your proof the guest was let in.";

export type WalkTone = "calm" | "warn" | "stop";

export const validWalks = (incidents: WalkIncident[]) =>
  incidents.filter((incident) => !incident.isFalse);

export function walkStanding(count: number): { tone: WalkTone; text: string } {
  if (count >= WALK_LIMIT)
    return {
      tone: "stop",
      text: `You have ${count} incidents on your record, so you cannot open new nights. Nights already open are not affected.`,
    };
  if (count === WALK_LIMIT - 1)
    return {
      tone: "warn",
      text: "One incident is on your public record. One more and you can no longer open new nights.",
    };
  return {
    tone: "calm",
    text: `No guest has been turned away. ${WALK_LIMIT} incidents stop you opening new nights.`,
  };
}
