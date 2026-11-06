import type { Ports } from "../../../../container/ports";
import { DomainError } from "../../../../shared/errors/domain-error";
import type { StayRepo } from "../../repo/stay-repo";
import { getTrip } from "./get-trip";
export function createCheckIn(ports: Ports, repo: StayRepo) {
  return (id: string, token: string, userId: string) => {
    const saved = getTrip(repo, id, userId);
    if (
      ports.db.query("SELECT 1 FROM walk_reports WHERE booking_id = ?").get(id)
    )
      throw new DomainError(
        "FAILED_PRECONDITION",
        "This booking has a walk report.",
      );
    if (
      !ports.verifications.consume({
        token,
        userId,
        action: "check_in",
        resourceId: id,
      })
    )
      throw new DomainError(
        "PERMISSION_DENIED",
        "Verify your identity to check in.",
      );
    if (saved.trip.checkOut < ports.clock.today())
      throw new DomainError("FAILED_PRECONDITION", "This stay has ended.");
    saved.trip.checkedIn = true;
    repo.trips.set(id, saved);
    return structuredClone(saved.trip);
  };
}
