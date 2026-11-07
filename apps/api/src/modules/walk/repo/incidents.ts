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
      },
      [string]
    >(
      "SELECT id, reported_at, status, evidence_hash FROM walk_reports WHERE property_id = ? AND status != 'pending' ORDER BY reported_at, id",
    )
    .all(propertyId)
    .map((row) => ({
      id: row.id,
      evidenceHash: row.evidence_hash,
      reportedAt: timestampFromMs(Number(row.reported_at)),
      isFalse: row.status === "false",
    }));
}
