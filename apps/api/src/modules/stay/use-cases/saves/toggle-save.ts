import type { Ports } from "../../../../container/ports";
import { DomainError } from "../../../../shared/errors/domain-error";
import type { StayRepo } from "../../repo/stay-repo";
export function createToggleSave(ports: Ports, repo: StayRepo) {
  return (propertyId: string, userId: string) => {
    if (!ports.catalog.get(propertyId))
      throw new DomainError("NOT_FOUND", "Property not found.");
    const saves = repo.saves.get(userId) ?? new Set<string>();
    if (saves.has(propertyId)) saves.delete(propertyId);
    else saves.add(propertyId);
    repo.saves.set(userId, saves);
    return saves.has(propertyId);
  };
}
