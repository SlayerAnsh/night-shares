import type { Ports } from "../../../container/ports";
import { transaction } from "../../../db/transaction";
import { DomainError } from "../../../shared/errors/domain-error";
import { banWalkReporter } from "../repo/bans";
import { syncWalkTrip } from "../repo/owed";

// Moderation stub for trusted administrators and tests; deliberately no public RPC.
export function markWalkFalse(ports: Ports, reportId: string) {
  transaction(ports.db, () => {
    const report = ports.db
      .query<
        { human_id: string; status: string; property_id: string },
        [string]
      >("SELECT human_id, status, property_id FROM walk_reports WHERE id = ?")
      .get(reportId);
    if (!report) throw new DomainError("NOT_FOUND", "Walk report not found.");
    if (
      report.status === "pending" ||
      ports.db
        .query("SELECT 1 FROM walk_claim_locks WHERE property_id = ?")
        .get(report.property_id)
    )
      throw new DomainError(
        "FAILED_PRECONDITION",
        "Walk settlement is in progress.",
      );
    if (
      ports.db
        .query("SELECT 1 FROM stay_chain_walks WHERE report_id = ?")
        .get(reportId)
    )
      throw new DomainError(
        "FAILED_PRECONDITION",
        "On-chain walk claims cannot be cancelled by local moderation.",
      );
    ports.db
      .query(
        "UPDATE walk_reports SET status = 'false', owed_to_guest = owed_paid WHERE id = ?",
      )
      .run(reportId);
    syncWalkTrip(ports.db, reportId);
    banWalkReporter(ports.db, report.human_id, reportId, ports.clock.now());
  });
}
