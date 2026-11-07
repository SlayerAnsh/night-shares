import type { Database } from "bun:sqlite";
import { timestampFromMs } from "@bufbuild/protobuf/wkt";
export function walkIncidents(db: Database, propertyId: string) {
  return db
    .query<
      {
        id: string;
        reported_at: bigint;
        status: string;
        evidence_hash: string;
        guest_id: string;
        from_pending: bigint;
        from_fund: bigint;
        owed_to_guest: bigint;
        owed_paid: bigint;
      },
      [string]
    >(
      "SELECT * FROM walk_reports WHERE property_id = ? AND status != 'pending' ORDER BY reported_at, id",
    )
    .all(propertyId)
    .map((row) => ({
      id: row.id,
      evidenceHash: row.evidence_hash,
      guestId: row.guest_id,
      fromPending: { micros: row.from_pending },
      fromFund: { micros: row.from_fund },
      owedToGuest: { micros: row.owed_to_guest },
      owedPaid: { micros: row.owed_paid },
      reportedAt: timestampFromMs(Number(row.reported_at)),
      isFalse: row.status === "false",
    }));
}
