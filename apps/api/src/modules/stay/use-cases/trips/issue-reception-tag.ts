import type { Ports } from "../../../../container/ports";
import { DomainError } from "../../../../shared/errors/domain-error";
import type { StayRepo } from "../../repo/stay-repo";
import { getTrip } from "./get-trip";

export function createIssueReceptionTag(ports: Ports, repo: StayRepo) {
  return (bookingId: string, userId: string) => {
    if (!ports.issueReceptionTag)
      throw new DomainError(
        "FAILED_PRECONDITION",
        "Reception tag issuance is available only with DEV_TAG_ISSUER=true in mock mode.",
      );
    const saved = getTrip(repo, bookingId, userId);
    return {
      tagPayload: ports.issueReceptionTag(
        saved.trip.propertyId,
        ports.clock.now(),
      ),
    };
  };
}
