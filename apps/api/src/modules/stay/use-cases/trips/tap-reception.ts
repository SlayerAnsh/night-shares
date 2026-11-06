import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import type { Ports } from "../../../../container/ports";
import { DomainError } from "../../../../shared/errors/domain-error";
import type { StayRepo } from "../../repo/stay-repo";
import { getTrip } from "./get-trip";

export function createTapReception(ports: Ports, repo: StayRepo) {
  return (bookingId: string, tagPayload: string, userId: string) => {
    const saved = getTrip(repo, bookingId, userId);
    // The mock tag payload is the property ID; a real adapter must verify proximity.
    if (tagPayload !== saved.trip.propertyId)
      throw new DomainError(
        "INVALID_ARGUMENT",
        "Reception tag does not match this property.",
      );
    const at = ports.clock.now();
    ports.db
      .query(
        "INSERT INTO reception_taps VALUES (?, ?, ?) ON CONFLICT(booking_id) DO NOTHING",
      )
      .run(bookingId, tagPayload, at);
    const row = ports.db
      .query<{ tapped_at: bigint }, [string]>(
        "SELECT tapped_at FROM reception_taps WHERE booking_id = ?",
      )
      .get(bookingId);
    return { tappedAt: timestampFromMs(Number(row?.tapped_at ?? at)) };
  };
}
