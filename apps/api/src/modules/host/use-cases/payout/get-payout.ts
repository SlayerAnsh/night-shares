import { coverAccount } from "../../../double-sale/repo/cover-accounts";
import { payoutOf } from "../../mappers/payout";
import type { HostDeps } from "../deps";
import { recordsFor } from "../reporting/records";
export function createGetPayout(deps: HostDeps, includeDebt = true) {
  return (userId: string, propertyId: string) =>
    payoutOf(
      recordsFor(deps, userId, propertyId, deps.ports.clock.today(), 60),
      deps.repo.withdrawn(propertyId) +
        coverAccount(deps.ports.db, propertyId).spent +
        (includeDebt ? coverAccount(deps.ports.db, propertyId).debt : 0n),
    );
}
