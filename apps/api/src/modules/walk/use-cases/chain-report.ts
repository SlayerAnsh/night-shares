import { type Address, type Hex, keccak256, stringToHex } from "viem";
import type { Ports } from "../../../container/ports";
import { transaction } from "../../../db/transaction";
import type { WalkReport } from "../../../ports/booking-report/booking-report";
import {
  deserialize,
  type ExecutionRequest,
  serialize,
  type WalkAttestation,
} from "../../../ports/chain-executor/chain-executor";
import { DomainError } from "../../../shared/errors/domain-error";
import {
  type ChainBooking,
  chainContext,
  confirmed,
  receiptEvents,
} from "../../stay/chain/context";
import type { StayRepo } from "../../stay/repo/stay-repo";
import { syncWalkTrip } from "../repo/owed";
import { tapEvidenceHash } from "../walk-attestation";
import { validateReport } from "./validate-report";

type Intent = {
  fingerprint: string;
  report_id: string;
  payload: string;
  state: string;
};
type Payload = { report: WalkReport; request: ExecutionRequest; host: Address };

async function executeReport(ports: Ports, repo: StayRepo, report: WalkReport) {
  const { executor, reader, custody, deployment } = chainContext(ports);
  await reader.assertCurrent();
  const get = () =>
    ports.db
      .query<Intent, [string]>(
        "SELECT fingerprint, report_id, payload, state FROM stay_chain_walks WHERE booking_id = ?",
      )
      .get(report.bookingId);
  let intent = get();
  if (!intent) {
    const saved = validateReport(ports, repo, report);
    const mapping = ports.db
      .query<{ chain_booking_id: Hex; fingerprint: string }, [string]>(
        "SELECT chain_booking_id, fingerprint FROM stay_chain_bookings WHERE trip_id = ? AND state = 'booked'",
      )
      .get(report.bookingId);
    if (!mapping || mapping.fingerprint !== reader.fingerprint)
      throw new DomainError(
        "FAILED_PRECONDITION",
        "This trip has no confirmed booking on the active deployment.",
      );
    if (!ports.chainAttester)
      throw new DomainError(
        "FAILED_PRECONDITION",
        "Walk attester is unavailable.",
      );
    const wallet = await custody.getWallet({
      kind: "user",
      humanId: report.humanId,
    });
    if (
      !wallet ||
      wallet.address.toLowerCase() !== saved.walletAddress.toLowerCase()
    )
      throw new DomainError(
        "PERMISSION_DENIED",
        "Guest custody wallet is unavailable.",
      );
    const head = await reader.head();
    const booking = (
      await reader.read<ChainBooking>(
        {
          contract: "BookingRouter",
          functionName: "booking",
          args: [mapping.chain_booking_id],
        },
        head.number,
      )
    ).value;
    const config = (
      await reader.read<{ property: Hex; host: Address }>(
        {
          contract: "NightFactory",
          functionName: "config",
          args: [booking.night],
        },
        head.number,
      )
    ).value;
    if (
      booking.guest.toLowerCase() !== wallet.address.toLowerCase() ||
      booking.qty !== 10n ** 18n ||
      booking.paid !== saved.trip.total?.micros ||
      config.property !== keccak256(stringToHex(saved.trip.propertyId))
    )
      throw new DomainError(
        "FAILED_PRECONDITION",
        "Chain booking does not match the trip.",
      );
    const attestation: WalkAttestation = {
      reportId: keccak256(
        stringToHex(`walk:${reader.fingerprint}:${mapping.chain_booking_id}`),
      ),
      bookingId: mapping.chain_booking_id,
      property: config.property,
      guest: wallet.address,
      paid: booking.paid,
      evidenceHash: `0x${tapEvidenceHash(saved.tap, report.bookingId).replace(/^0x/, "")}`,
      reportedAt: BigInt(Math.floor(report.reportedAt / 1000)),
      deadline: head.timestamp + 600n,
    };
    if (
      attestation.reportedAt < booking.checkIn ||
      attestation.reportedAt > booking.checkIn + 86400n ||
      attestation.reportedAt > head.timestamp
    )
      throw new DomainError(
        "FAILED_PRECONDITION",
        "Report within 24 hours after chain check-in time.",
      );
    const signature = await ports.chainAttester.sign({
      kind: "walk",
      report: attestation,
    });
    const request: ExecutionRequest = {
      operationId: `walk:${reader.fingerprint}:${report.id}`,
      walletId: wallet.walletId,
      command: { kind: "reportWalk", report: attestation, signature },
    };
    await reader.simulate(request.command, wallet.address);
    transaction(ports.db, () => {
      if (get()) return;
      validateReport(ports, repo, report);
      ports.db
        .query(
          "INSERT INTO stay_chain_walks (booking_id, fingerprint, report_id, payload) VALUES (?, ?, ?, ?)",
        )
        .run(
          report.bookingId,
          reader.fingerprint,
          report.id,
          serialize({ report, request, host: config.host } satisfies Payload),
        );
      ports.db
        .query(
          "INSERT INTO walk_reports (id, booking_id, property_id, human_id, guest_id, reported_at, status, paid, from_pending, from_fund, evidence_hash) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, 0, 0, ?)",
        )
        .run(
          report.id,
          report.bookingId,
          saved.trip.propertyId,
          report.humanId,
          report.humanId,
          report.reportedAt,
          booking.paid,
          attestation.evidenceHash,
        );
    });
    intent = get();
  }
  if (!intent || intent.fingerprint !== reader.fingerprint)
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Walk belongs to a different deployment.",
    );
  const payload = deserialize<Payload>(intent.payload);
  if (
    payload.report.userId !== report.userId ||
    payload.report.humanId !== report.humanId
  )
    throw new DomainError(
      "PERMISSION_DENIED",
      "Walk report belongs to a different guest.",
    );
  if (intent.state !== "done") {
    const result = await executor.execute(payload.request);
    if (result.state === "reverted")
      transaction(ports.db, () => {
        // The journal retains the reverted transaction. A new report needs review.
        ports.db
          .query(
            "UPDATE stay_chain_walks SET state = 'reverted' WHERE booking_id = ?",
          )
          .run(report.bookingId);
      });
    const receipt = confirmed(result);
    if (payload.request.command.kind !== "reportWalk")
      throw new Error("Invalid walk intent.");
    const attestation = payload.request.command.report;
    const [event] = receiptEvents<{
      reportId: Hex;
      bookingId: Hex;
      guest: Address;
      fromPending: bigint;
      fromFund: bigint;
      hostDebt: bigint;
      evidenceHash: Hex;
    }>(result, deployment, "Settlement", "WalkPaid");
    if (
      !event ||
      event.reportId !== attestation.reportId ||
      event.bookingId !== attestation.bookingId ||
      event.guest.toLowerCase() !== attestation.guest.toLowerCase() ||
      event.evidenceHash !== attestation.evidenceHash
    )
      throw new Error("Walk receipt does not match the attestation.");
    const read = async <T>(functionName: string, args: readonly unknown[]) =>
      (
        await reader.read<T>(
          { contract: "Settlement", functionName, args },
          receipt.blockNumber,
        )
      ).value;
    const [reported, evidence, incidents, debt, guestDebt, credit] =
      await Promise.all([
        read<boolean>("reported", [attestation.bookingId]),
        read<Hex>("evidenceHash", [attestation.reportId]),
        read<bigint>("incidents", [payload.host]),
        read<bigint>("hostDebt", [payload.host]),
        read<bigint>("guestClaimTotal", [payload.host]),
        read<bigint>("credits", [attestation.guest]),
      ]);
    if (!reported || evidence !== attestation.evidenceHash)
      throw new Error("Walk getter does not match the receipt.");
    const owed = attestation.paid - event.fromPending - event.fromFund;
    if (owed < 0n)
      throw new Error("Walk refund exceeds the recorded booking payment.");
    transaction(ports.db, () => {
      ports.db
        .query(
          "UPDATE walk_reports SET status = 'done', from_pending = ?, from_fund = ?, owed_to_guest = ? WHERE id = ?",
        )
        .run(event.fromPending, event.fromFund, owed, intent.report_id);
      ports.db
        .query(
          "UPDATE stay_chain_walks SET state = 'done', tx_hash = ?, host = ?, host_debt = ?, incidents = ?, credit = ? WHERE booking_id = ?",
        )
        .run(
          receipt.transactionHash,
          payload.host,
          String(debt + guestDebt),
          String(incidents),
          String(credit),
          report.bookingId,
        );
      syncWalkTrip(ports.db, intent.report_id);
    });
  }
  const saved = repo.trips.get(report.bookingId);
  if (!saved?.trip.walk)
    throw new Error("Confirmed walk projection is missing.");
  const walk = saved.trip.walk;
  return {
    reportId: walk.reportId,
    evidenceHash: walk.evidenceHash,
    guestId: walk.guestId,
    paidToGuest: { micros: walk.paidToGuest?.micros ?? 0n },
    fromPending: { micros: walk.fromPending?.micros ?? 0n },
    fromFund: { micros: walk.fromFund?.micros ?? 0n },
    owedToGuest: { micros: walk.owedToGuest?.micros ?? 0n },
    owedPaid: { micros: walk.owedPaid?.micros ?? 0n },
  };
}

export async function reportOnChain(
  ports: Ports,
  repo: StayRepo,
  report: WalkReport,
) {
  try {
    return await executeReport(ports, repo, report);
  } catch (error) {
    transaction(ports.db, () => {
      const intent = ports.db
        .query<Intent, [string]>(
          "SELECT fingerprint, report_id, payload, state FROM stay_chain_walks WHERE booking_id = ?",
        )
        .get(report.bookingId);
      if (!intent || intent.state === "done") return;
      const payload = deserialize<Payload>(intent.payload);
      if (payload.report.userId !== report.userId) return;
      const operation = ports.db
        .query<{ state: string }, [string]>(
          "SELECT state FROM chain_operations WHERE id = ?",
        )
        .get(payload.request.operationId);
      if (operation && operation.state !== "reverted") return;
      ports.db
        .query("DELETE FROM walk_reports WHERE id = ? AND status = 'pending'")
        .run(intent.report_id);
      ports.db
        .query("DELETE FROM stay_chain_walks WHERE booking_id = ?")
        .run(report.bookingId);
    });
    throw error;
  }
}
