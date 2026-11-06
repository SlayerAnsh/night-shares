import type { Ports } from "../../../container/ports";
import { DomainError } from "../../../shared/errors/domain-error";
export function createGetProperty(ports: Ports) {
  return (id: string) => {
    const property = ports.catalog.get(id);
    if (!property) throw new DomainError("NOT_FOUND", "Property not found.");
    return property;
  };
}
