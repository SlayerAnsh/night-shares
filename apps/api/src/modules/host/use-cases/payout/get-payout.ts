import { payoutOf } from "../../mappers/payout";
import type { HostDeps } from "../deps";
import { recordsFor } from "../reporting/records";
export function createGetPayout(deps: HostDeps) {
  return (userId: string, propertyId: string) =>
    payoutOf(
      recordsFor(deps, userId, propertyId, deps.ports.clock.today(), 60),
      deps.repo.withdrawn(userId, propertyId),
    );
}
