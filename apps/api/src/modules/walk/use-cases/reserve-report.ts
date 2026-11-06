import type { Ports } from "../../../container/ports";
import type { WalkReport } from "../../../ports/booking-report/booking-report";
import { DomainError } from "../../../shared/errors/domain-error";
import { payoutOf } from "../../host/mappers/payout";
import { createSqliteHostRepo } from "../../host/repo/host-repo.sqlite";
import type { StayRepo } from "../../stay/repo/stay-repo";
import { adjustCoverAccount, coverAccount } from "../repo/cover-accounts";
import { tapEvidenceHash, type WalkAttestation } from "../walk-attestation";
import { payoutLegs } from "./payout-legs";
import { validateReport } from "./validate-report";

export function reserveReport(
  ports: Ports,
  repo: StayRepo,
  report: WalkReport,
) {
  const saved = validateReport(ports, repo, report);
  const propertyId = saved.trip.propertyId;
  const attestation: WalkAttestation = {
    reportId: report.id,
    bookingId: report.bookingId,
    propertyId,
    humanId: report.humanId,
    reportedAt: report.reportedAt,
    evidenceHash: tapEvidenceHash(saved.tap, report.bookingId),
  };
  if (
    ports.db
      .query(
        "SELECT 1 FROM host_sweeps WHERE property_id = ? AND status = 'pending'",
      )
      .get(propertyId)
  )
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Host payout settlement is in progress.",
    );
  if (
    ports.db
      .query(
        "SELECT 1 FROM market_settlements s JOIN inventory i ON i.night_key = s.night_key WHERE i.property_id = ?",
      )
      .get(propertyId) ||
    ports.db
      .query("SELECT 1 FROM stay_locks WHERE busy = 1 AND trip_id IS NULL")
      .get()
  )
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Property settlement is in progress.",
    );
  const account = coverAccount(ports.db, propertyId);
  const pending = payoutOf(
    ports.inventory.list({ propertyId }),
    createSqliteHostRepo(ports).withdrawn(propertyId) +
      account.spent +
      account.debt,
  ).availableNow.micros;
  const paid = saved.trip.total?.micros ?? 0n;
  const payout = payoutLegs(paid, pending, saved.walletAddress);
  ports.db
    .query(
      "INSERT INTO walk_reports (id, booking_id, property_id, human_id, reported_at, status, paid, from_pending, from_fund, evidence_hash) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)",
    )
    .run(
      report.id,
      report.bookingId,
      propertyId,
      report.humanId,
      report.reportedAt,
      paid,
      payout.fromPending,
      payout.fromFund,
      attestation.evidenceHash,
    );
  adjustCoverAccount(ports.db, propertyId, payout.fromPending, payout.debt);
  return { ...payout, propertyId, trip: saved.trip, attestation };
}
