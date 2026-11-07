import type { Database } from "bun:sqlite";
import type { SettlementLeg } from "../../../ports/wallet-provider/wallet-provider";
import { createSqliteStayRepo } from "../../stay/repo/stay-repo.sqlite";

export function syncWalkTrip(db: Database, reportId: string) {
  const row = db
    .query<
      {
        booking_id: string;
        from_pending: bigint;
        from_fund: bigint;
        owed_to_guest: bigint;
        owed_paid: bigint;
        evidence_hash: string;
        guest_id: string;
      },
      [string]
    >("SELECT * FROM walk_reports WHERE id = ?")
    .get(reportId);
  if (!row) return;
  const repo = createSqliteStayRepo(db);
  const saved = repo.trips.get(row.booking_id);
  if (!saved) return;
  saved.trip.walk = {
    $typeName: "night_shares.stay.v1.WalkRefund",
    reportId,
    evidenceHash: row.evidence_hash,
    guestId: row.guest_id,
    fromPending: {
      $typeName: "night_shares.common.v1.Usdc",
      micros: row.from_pending,
    },
    fromFund: {
      $typeName: "night_shares.common.v1.Usdc",
      micros: row.from_fund,
    },
    owedToGuest: {
      $typeName: "night_shares.common.v1.Usdc",
      micros: row.owed_to_guest,
    },
    owedPaid: {
      $typeName: "night_shares.common.v1.Usdc",
      micros: row.owed_paid,
    },
    paidToGuest: {
      $typeName: "night_shares.common.v1.Usdc",
      micros: row.from_pending + row.from_fund + row.owed_paid,
    },
  };
  repo.trips.set(row.booking_id, saved);
}

export function outstandingGuest(db: Database, propertyId: string) {
  return (
    db
      .query<{ amount: bigint }, [string]>(
        "SELECT COALESCE(SUM(owed_to_guest - owed_paid), 0) AS amount FROM walk_reports WHERE property_id = ? AND status = 'done'",
      )
      .get(propertyId)?.amount ?? 0n
  );
}

export function reserveOwed(
  db: Database,
  propertyId: string,
  available: bigint,
) {
  db.query("INSERT INTO walk_claim_locks VALUES (?)").run(propertyId);
  const payments: { id: string; amount: bigint }[] = [];
  const legs: SettlementLeg[] = [];
  let remaining = available;
  const rows = db
    .query<{ id: string; owed: bigint; wallet_address: string }, [string]>(`
    SELECT w.id, w.owed_to_guest - w.owed_paid AS owed, t.wallet_address
    FROM walk_reports w JOIN stay_trips t ON t.id = w.booking_id
    WHERE w.property_id = ? AND w.status = 'done' AND w.owed_to_guest > w.owed_paid
    ORDER BY w.reported_at, w.rowid
  `)
    .all(propertyId);
  for (const row of rows) {
    if (remaining <= 0n) break;
    let amount = row.owed;
    if (amount > remaining) amount = remaining;
    remaining -= amount;
    payments.push({ id: row.id, amount });
    db.query(
      "UPDATE walk_reports SET owed_paid = owed_paid + ? WHERE id = ?",
    ).run(amount, row.id);
    legs.push({
      from: "pool",
      to: row.wallet_address,
      amount,
      memo: `walk owed:${row.id}`,
    });
  }
  return { propertyId, payments, legs, amount: available - remaining };
}

export function finishOwed(
  db: Database,
  reservation: ReturnType<typeof reserveOwed>,
  failed = false,
) {
  for (const payment of reservation.payments) {
    if (failed)
      db.query(
        "UPDATE walk_reports SET owed_paid = owed_paid - ? WHERE id = ?",
      ).run(payment.amount, payment.id);
    else syncWalkTrip(db, payment.id);
  }
  db.query("DELETE FROM walk_claim_locks WHERE property_id = ?").run(
    reservation.propertyId,
  );
}
