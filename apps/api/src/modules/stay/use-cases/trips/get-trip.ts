import { DomainError } from "../../../../shared/errors/domain-error";
import type { StayRepo } from "../../repo/stay-repo";
export function getTrip(repo: StayRepo, id: string, userId: string) {
  const saved = repo.trips.get(id);
  if (!saved || saved.userId !== userId)
    throw new DomainError("NOT_FOUND", "Trip not found.");
  return saved;
}
