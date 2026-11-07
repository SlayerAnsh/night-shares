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
      ports.chainExecutor?.mode === "chain" &&
      (!payout || !isAddress(payout) || payout === zeroAddress)
    )
      throw new DomainError(
        "INVALID_ARGUMENT",
        "Enter a permanent host payout address.",
      );
    if (
      repo.owner(propertyId) &&
      !(
        ports.chainExecutor?.mode === "chain" &&
        repo.owner(propertyId) === userId
      )
    )
      throw new DomainError(
        "PERMISSION_DENIED",
        "This property is managed by another host.",
      );
    if (ports.chainExecutor?.mode === "chain")
      await hostWallet({ ports, repo }, userId);
    const imported = await ports.channelManager.connect({
      propertyId,
      pms: name,
    });
    let provisional = false;
    transaction(ports.db, () => {
      const owner = repo.owner(propertyId);
      if (owner && !(ports.chainExecutor?.mode === "chain" && owner === userId))
        throw new DomainError(
          "PERMISSION_DENIED",
          "This property is managed by another host.",
        );
      if (!owner) {
        repo.claim(userId, propertyId);
        provisional = true;
      }
      if (ports.chainExecutor?.mode !== "chain")
        repo
          .connections(userId)
          .set(propertyId, { pms: name, roomTypes: imported.roomTypes });
    });
    if (ports.chainExecutor?.mode === "chain") {
      try {
        await bindProperty({ ports, repo }, userId, propertyId, payout ?? "");
        repo
          .connections(userId)
          .set(propertyId, { pms: name, roomTypes: imported.roomTypes });
      } catch (error) {
        if (provisional)
          transaction(ports.db, () => {
            repo.connections(userId).delete(propertyId);
            ports.db
              .query(
                "DELETE FROM host_owners WHERE property_id = ? AND user_id = ?",
              )
              .run(propertyId, userId);
          });
        throw error;
      }
    }
    return { ...property, roomTypes: imported.roomTypes };
  };
}
