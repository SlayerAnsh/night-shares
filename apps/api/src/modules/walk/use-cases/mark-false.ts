import type { Ports } from "../../../container/ports";
import { transaction } from "../../../db/transaction";
import { DomainError } from "../../../shared/errors/domain-error";

// Moderation stub for trusted administrators and tests; deliberately no public RPC.
export function markWalkFalse(ports: Ports, reportId: string) {
  transaction(ports.db, () => {
    const report = ports.db
      .query<{ human_id: string; status: string }, [string]>(
        "SELECT human_id, status FROM walk_reports WHERE id = ?",
      )
      .get(reportId);
    if (!report) throw new DomainError("NOT_FOUND", "Walk report not found.");
    if (report.status === "pending")
      throw new DomainError(
        "FAILED_PRECONDITION",
        "Walk settlement is in progress.",
      );
    ports.db
      .query("UPDATE walk_reports SET status = 'false' WHERE id = ?")
      .run(reportId);
    ports.db
      .query("INSERT OR IGNORE INTO walk_bans VALUES (?, ?, ?)")
      .run(report.human_id, reportId, ports.clock.now());
  });
}
