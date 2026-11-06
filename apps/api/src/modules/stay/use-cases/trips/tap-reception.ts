import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import type { Ports } from "../../../../container/ports";
import { DomainError } from "../../../../shared/errors/domain-error";
import type { StayRepo } from "../../repo/stay-repo";
import { getTrip } from "./get-trip";

export function createTapReception(ports: Ports, repo: StayRepo) {
  return (bookingId: string, tagPayload: string, userId: string) => {
    const saved = getTrip(repo, bookingId, userId);
    const at = ports.clock.now();
    const result = ports.receptionTag.verify({
      payload: tagPayload,
      propertyId: saved.trip.propertyId,
      bookingId,
      now: at,
    });
    if (!result.ok) throw new DomainError("INVALID_ARGUMENT", result.reason);
    ports.db
      .query(
        "INSERT INTO reception_taps VALUES (?, ?, ?) ON CONFLICT(booking_id) DO NOTHING",
      )
      .run(bookingId, result.tagId, at);
    const row = ports.db
      .query<{ tapped_at: bigint }, [string]>(
        "SELECT tapped_at FROM reception_taps WHERE booking_id = ?",
      )
      .get(bookingId);
    return { tappedAt: timestampFromMs(Number(row?.tapped_at ?? at)) };
  };
}
