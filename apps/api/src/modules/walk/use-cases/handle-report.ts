import type { Ports } from "../../../container/ports";
import { transaction } from "../../../db/transaction";
import type { WalkReport } from "../../../ports/booking-report/booking-report";
import { DomainError } from "../../../shared/errors/domain-error";
import type { StayRepo } from "../../stay/repo/stay-repo";
import { createSqliteStayRepo } from "../../stay/repo/stay-repo.sqlite";
import { adjustCoverAccount } from "../repo/cover-accounts";
import { syncWalkTrip } from "../repo/owed";
import { reportOnChain } from "./chain-report";
import { reserveReport } from "./reserve-report";

export async function handleReport(
  ports: Ports,
  report: WalkReport,
  repo: StayRepo = createSqliteStayRepo(ports.db),
) {
  if (ports.chainExecutor && ports.chainExecutor.mode !== "mock")
    return reportOnChain(ports, repo, report);
  if (ports.db.query("SELECT 1 FROM walk_fund_lock").get())
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Walk fund settlement is in progress.",
    );
  ports.db.query("INSERT INTO walk_fund_lock VALUES (1)").run();
  try {
    const fund = await ports.walletProvider.balance("cover_fund");
    const reserved = transaction(ports.db, () =>
      reserveReport(ports, repo, report, fund),
    );
    try {
      await ports.walletProvider.settle(reserved.legs);
    } catch (error) {
      transaction(ports.db, () => {
        adjustCoverAccount(
          ports.db,
          reserved.propertyId,
          -reserved.fromPending,
          -reserved.debt,
        );
        ports.db.query("DELETE FROM walk_reports WHERE id = ?").run(report.id);
      });
      throw error;
    }
    transaction(ports.db, () => {
      ports.db
        .query("UPDATE walk_reports SET status = 'done' WHERE id = ?")
        .run(report.id);
      syncWalkTrip(ports.db, report.id);
      const event = {
        nightKey: `${reserved.propertyId}:${reserved.trip.roomTypeId}:${reserved.trip.checkIn}`,
        propertyId: reserved.propertyId,
        userId: report.userId,
        actor: "guest" as const,
        tenths: reserved.trip.rooms * 10,
      };
      ports.activity.append({ ...event, kind: "double_sale_reported" });
      ports.activity.append({
        ...event,
        kind: "double_sale_refund",
        priceMicros: reserved.fromPending + reserved.fromFund,
      });
    });
    return {
      reportId: report.id,
      paidToGuest: { micros: reserved.fromPending + reserved.fromFund },
      fromPending: { micros: reserved.fromPending },
      fromFund: { micros: reserved.fromFund },
      owedToGuest: { micros: reserved.owedToGuest },
      owedPaid: { micros: 0n },
      guestId: report.humanId,
      evidenceHash: reserved.attestation.evidenceHash,
    };
  } finally {
    ports.db.query("DELETE FROM walk_fund_lock").run();
  }
}
