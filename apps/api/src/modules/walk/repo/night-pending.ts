import type { Ports } from "../../../container/ports";
import { payoutOf } from "../../host/mappers/payout";
import type { NightRecord } from "../../inventory/inventory-repo";

export function nightWalkSpent(ports: Ports, night: NightRecord) {
  return (
    ports.db
      .query<{ spent: bigint }, [string, string, string]>(`
    SELECT COALESCE(SUM(w.from_pending), 0) AS spent
    FROM walk_reports w JOIN stay_trips t ON t.id = w.booking_id
    WHERE w.property_id = ? AND json_extract(t.snapshot, '$.roomTypeId') = ?
      AND json_extract(t.snapshot, '$.checkIn') = ?
  `)
      .get(night.propertyId, night.roomTypeId, night.date)?.spent ?? 0n
  );
}

export function nightPending(ports: Ports, night: NightRecord) {
  const snapshot = ports.db
    .query<{ earned: bigint; walk_spent: bigint }, [string]>(`
    SELECT n.earned, n.walk_spent FROM host_sweep_nights n
    JOIN host_sweeps s ON s.id = n.sweep_id WHERE n.night_key = ?
    ORDER BY s.rowid DESC LIMIT 1
  `)
    .get(night.key);
  // Historical property totals cannot identify which night was consumed. Until
  // the next full sweep snapshots the property, never spend ambiguous earnings.
  if (
    !snapshot &&
    ports.db
      .query(`
    SELECT 1 WHERE
      (EXISTS (SELECT 1 FROM host_withdrawals WHERE property_id = ? AND amount_micros > 0)
       OR EXISTS (SELECT 1 FROM host_sweeps WHERE property_id = ? AND (amount > 0 OR debt > 0)))
      AND NOT EXISTS (SELECT 1 FROM host_sweep_nights n JOIN host_sweeps s ON s.id = n.sweep_id WHERE s.property_id = ?)
  `)
      .get(night.propertyId, night.propertyId, night.propertyId)
  )
    return 0n;
  const cutoff =
    ports.db
      .query<{ amount: bigint }, [string]>(
        "SELECT amount FROM walk_cutoff_spent WHERE night_key = ?",
      )
      .get(night.key)?.amount ?? 0n;
  const available =
    payoutOf([night]).availableNow.micros -
    (snapshot?.earned ?? 0n) -
    nightWalkSpent(ports, night) +
    (snapshot?.walk_spent ?? 0n) -
    cutoff;
  return available > 0n ? available : 0n;
}

export function snapshotSweep(ports: Ports, propertyId: string, id: string) {
  for (const night of ports.inventory.list({ propertyId })) {
    const cutoff =
      ports.db
        .query<{ amount: bigint }, [string]>(
          "SELECT amount FROM walk_cutoff_spent WHERE night_key = ?",
        )
        .get(night.key)?.amount ?? 0n;
    ports.db
      .query("INSERT INTO host_sweep_nights VALUES (?, ?, ?, ?)")
      .run(
        id,
        night.key,
        payoutOf([night]).availableNow.micros - cutoff,
        nightWalkSpent(ports, night),
      );
  }
}
