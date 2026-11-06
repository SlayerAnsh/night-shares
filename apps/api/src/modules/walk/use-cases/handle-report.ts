import type { Ports } from "../../../container/ports";
import { transaction } from "../../../db/transaction";
import type { WalkReport } from "../../../ports/booking-report/booking-report";
import type { StayRepo } from "../../stay/repo/stay-repo";
import { createSqliteStayRepo } from "../../stay/repo/stay-repo.sqlite";
import { adjustCoverAccount } from "../repo/cover-accounts";
import { reserveReport } from "./reserve-report";

export async function handleReport(
  ports: Ports,
  report: WalkReport,
  repo: StayRepo = createSqliteStayRepo(ports.db),
) {
  const reserved = transaction(ports.db, () =>
    reserveReport(ports, repo, report),
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
      priceMicros: reserved.toGuest,
    });
  });
  return { reportId: report.id, paidToGuest: { micros: reserved.toGuest } };
}
