import { isAddress, zeroAddress } from "viem";
import { transaction } from "../../../db/transaction";
import { DomainError } from "../../../shared/errors/domain-error";
import { bindProperty, hostWallet } from "../chain/bind";
import type { HostDeps } from "./deps";
export function createConnectChannelManager({ ports, repo }: HostDeps) {
  return async (
    userId: string,
    propertyId: string,
    pms: number,
    payout?: string,
  ) => {
    const property = ports.catalog.get(propertyId);
    if (!property) throw new DomainError("NOT_FOUND", "Property not found.");
    const name = ["", "Mews", "Cloudbeds", "SiteMinder"][pms];
    if (!name)
      throw new DomainError("INVALID_ARGUMENT", "Choose a supported PMS.");
    if (
      ports.chainExecutor?.mode === "fork" &&
      (!payout || !isAddress(payout) || payout === zeroAddress)
    )
      throw new DomainError(
        "INVALID_ARGUMENT",
        "Enter a permanent host payout address.",
      );
    if (
      repo.owner(propertyId) &&
      !(
        ports.chainExecutor?.mode === "fork" &&
        repo.owner(propertyId) === userId
      )
    )
      throw new DomainError(
        "PERMISSION_DENIED",
        "This property is managed by another host.",
      );
    if (ports.chainExecutor?.mode === "fork")
      await hostWallet({ ports, repo }, userId);
    const imported = await ports.channelManager.connect({
      propertyId,
      pms: name,
    });
    transaction(ports.db, () => {
      if (
        !(
          ports.chainExecutor?.mode === "fork" &&
          repo.owner(propertyId) === userId
        )
      )
        repo.claim(userId, propertyId);
      repo
        .connections(userId)
        .set(propertyId, { pms: name, roomTypes: imported.roomTypes });
    });
    if (ports.chainExecutor?.mode === "fork")
      await bindProperty({ ports, repo }, userId, propertyId, payout ?? "");
    return { ...property, roomTypes: imported.roomTypes };
  };
}
