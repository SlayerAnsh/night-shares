import type { Ports } from "../../container/ports";
import type { BookingReport } from "../../ports/booking-report/booking-report";
import { handleReport } from "./use-cases/handle-report";

export async function pollReports(
  ports: Ports & { bookingReport?: BookingReport },
  reports = ports.bookingReport,
) {
  if (!reports) throw new Error("Booking report port is required.");
  const errors: unknown[] = [];
  for (const report of await reports.poll()) {
    if (
      ports.db
        .query(
          "SELECT 1 FROM walk_reports WHERE id = ? AND status != 'pending'",
        )
        .get(report.id)
    )
      continue;
    try {
      await handleReport(ports, report);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length)
    throw new AggregateError(errors, "Walk settlements failed.");
}
