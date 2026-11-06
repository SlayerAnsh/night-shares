import type { Ports } from "../../container/ports";
import type { BookingReport } from "../../ports/booking-report/booking-report";
import { handleReport } from "./use-cases/handle-report";
export async function pollReports(
  ports: Ports & { bookingReport?: BookingReport },
  reports: BookingReport | undefined = ports.bookingReport,
) {
  if (!reports) throw new Error("Booking report port is required.");
  const errors: unknown[] = [];
  for (const report of await reports.poll()) {
    try {
      await handleReport(ports, report);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length)
    throw new AggregateError(errors, "Double sale settlements failed.");
}
