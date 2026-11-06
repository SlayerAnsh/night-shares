import { DomainError } from "../../../shared/errors/domain-error";
import type { HostDeps } from "./deps";
export function createConnectChannelManager({ ports, repo }: HostDeps) {
  return async (userId: string, propertyId: string, pms: number) => {
    const property = ports.catalog.get(propertyId);
    if (!property) throw new DomainError("NOT_FOUND", "Property not found.");
    const name = ["", "Mews", "Cloudbeds", "SiteMinder"][pms];
    if (!name)
      throw new DomainError("INVALID_ARGUMENT", "Choose a supported PMS.");
    const imported = await ports.channelManager.connect({
      propertyId,
      pms: name,
    });
    repo
      .connections(userId)
      .set(propertyId, { pms: name, roomTypes: imported.roomTypes });
    return { ...property, roomTypes: imported.roomTypes };
  };
}
