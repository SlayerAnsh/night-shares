import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import type { Ports } from "../../../../container/ports";
import { transaction } from "../../../../db/transaction";
import { DomainError } from "../../../../shared/errors/domain-error";
import type { StayRepo } from "../../repo/stay-repo";
import { getTrip } from "./get-trip";

export function createTapReception(ports: Ports, repo: StayRepo) {
  return (bookingId: string, tagPayload: string, userId: string) =>
    transaction(ports.db, () => {
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
          "INSERT INTO reception_taps (booking_id, tag_id, tapped_at, tag_uid, counter) VALUES (?, ?, ?, ?, ?) ON CONFLICT(booking_id) DO UPDATE SET tag_id = excluded.tag_id, tapped_at = excluded.tapped_at, tag_uid = excluded.tag_uid, counter = excluded.counter WHERE reception_taps.counter IS NULL",
        )
        .run(bookingId, result.tagId, at, result.tagUid, result.counter);
      const row = ports.db
        .query<{ tapped_at: bigint }, [string]>(
          "SELECT tapped_at FROM reception_taps WHERE booking_id = ?",
        )
        .get(bookingId);
      return { tappedAt: timestampFromMs(Number(row?.tapped_at ?? at)) };
    });
}
