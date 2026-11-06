import { DomainError } from "../../../shared/errors/domain-error";
import type { HostDeps } from "./deps";
export function propertyOf(
  { ports, repo }: HostDeps,
  userId: string,
  propertyId: string,
) {
  const property = ports.catalog.get(propertyId);
  if (!property) throw new DomainError("NOT_FOUND", "Property not found.");
  if (!repo.connections(userId).has(propertyId))
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Connect the channel manager first.",
    );
  return property;
}
