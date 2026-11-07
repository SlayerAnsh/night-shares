import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import { coverAccount } from "../../../walk/repo/cover-accounts";
import { outstandingGuest } from "../../../walk/repo/owed";
import { payoutOf } from "../../mappers/payout";
import type { HostDeps } from "../deps";
import { recordsFor } from "../reporting/records";
export function createGetPayout(deps: HostDeps, includeDebt = true) {
  return (userId: string, propertyId: string) => {
    recordsFor(deps, userId, propertyId, deps.ports.clock.today(), 60);
    const payout = payoutOf(
      deps.ports.inventory.list({ propertyId }),
      deps.repo.withdrawn(propertyId) +
        coverAccount(deps.ports.db, propertyId).spent +
        (includeDebt
          ? coverAccount(deps.ports.db, propertyId).debt +
            outstandingGuest(deps.ports.db, propertyId)
          : 0n),
    );
    const last = deps.ports.db
      .query<{ amount: bigint; at: bigint; transaction_id: string }, [string]>(
        "SELECT amount, at, transaction_id FROM host_sweeps WHERE property_id = ? AND status = 'settled' ORDER BY at DESC, rowid DESC LIMIT 1",
      )
      .get(propertyId);
    return {
      ...payout,
      sweptTotal: {
        micros:
          deps.ports.db
            .query<{ total: bigint }, [string]>(
              "SELECT COALESCE(SUM(amount), 0) AS total FROM host_sweeps WHERE property_id = ? AND status = 'settled'",
            )
            .get(propertyId)?.total ?? 0n,
      },
      lastSweepAt: last ? timestampFromMs(Number(last.at)) : undefined,
      lastSweepAmount: { micros: last?.amount ?? 0n },
      lastSweepTransactionId: last?.transaction_id ?? "",
    };
  };
}
