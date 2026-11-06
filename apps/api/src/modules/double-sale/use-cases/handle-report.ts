import type { Ports } from "../../../container/ports";
import { transaction } from "../../../db/transaction";
import type { DoubleSaleReport } from "../../../ports/booking-report/booking-report";
import { adjustCoverAccount } from "../repo/cover-accounts";
import { restore } from "../repo/positions";
import { reserveReport } from "./reserve-report";
export async function handleReport(ports: Ports, report: DoubleSaleReport) {
  const reserved = transaction(ports.db, () => reserveReport(ports, report));
  if (!reserved) return;
  try {
    await ports.walletProvider.settle(reserved.legs);
  } catch (error) {
    transaction(ports.db, () => {
      ports.inventory.update(report.nightKey, () => reserved.before);
      for (const holder of reserved.positions)
        restore(ports.db, report.nightKey, holder);
      adjustCoverAccount(
        ports.db,
        reserved.before.propertyId,
        -reserved.spent,
        -reserved.debt,
      );
      ports.db
        .query("DELETE FROM double_sale_reports WHERE id = ?")
        .run(report.id);
    });
    throw error;
  }
  transaction(ports.db, () => {
    ports.db
      .query("UPDATE double_sale_reports SET status = 'done' WHERE id = ?")
      .run(report.id);
    const event = {
      nightKey: report.nightKey,
      propertyId: reserved.before.propertyId,
      actor: "pool" as const,
    };
    ports.activity.append({
      ...event,
      kind: "double_sale_reported",
      tenths: report.rooms * 10,
    });
    for (const payment of reserved.payments) {
      if (payment.size)
        ports.activity.append({
          ...event,
          kind: "double_sale_refund",
          userId: payment.holder.id,
          tenths: payment.size,
          priceMicros: reserved.bid,
        });
    }
  });
}
