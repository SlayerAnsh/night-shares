import { WALK_REPORT_HOURS } from "@night-shares/market-model";
import type { Ports } from "../../../container/ports";
import type { WalkReport } from "../../../ports/booking-report/booking-report";
import { DomainError } from "../../../shared/errors/domain-error";
import type { StayRepo } from "../../stay/repo/stay-repo";
import { getTrip } from "../../stay/use-cases/trips/get-trip";

export function validateReport(
  ports: Ports,
  repo: StayRepo,
  report: WalkReport,
) {
  const saved = getTrip(repo, report.bookingId, report.userId);
  const { db } = ports;
  if (
    !report.humanId ||
    db.query("SELECT 1 FROM walk_bans WHERE human_id = ?").get(report.humanId)
  )
    throw new DomainError(
      "PERMISSION_DENIED",
      "Walk reports are banned for this World ID.",
    );
  if (
    db
      .query("SELECT 1 FROM walk_reports WHERE booking_id = ?")
      .get(report.bookingId)
  )
    throw new DomainError(
      "FAILED_PRECONDITION",
      "This booking already has a walk report.",
    );
  // Catalog dates use UTC until property timezone metadata is introduced.
  const checkIn = Date.parse(`${saved.trip.checkIn}T15:00:00Z`);
  if (
    !Number.isFinite(report.reportedAt) ||
    report.reportedAt < checkIn ||
    report.reportedAt > checkIn + WALK_REPORT_HOURS * 3_600_000 ||
    report.reportedAt > ports.clock.now()
  )
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Report within 24 hours after check-in time.",
    );
  const tap = db
    .query<{ tapped_at: bigint }, [string]>(
      "SELECT tapped_at FROM reception_taps WHERE booking_id = ?",
    )
    .get(report.bookingId);
  if (!tap || Number(tap.tapped_at) > report.reportedAt)
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Tap the reception tag before reporting a walked stay.",
    );
  if (saved.trip.checkedIn)
    throw new DomainError(
      "FAILED_PRECONDITION",
      "A World ID desk check-in already exists for this booking.",
    );
  return saved;
}
