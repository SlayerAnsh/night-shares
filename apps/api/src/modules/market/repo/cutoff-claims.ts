import type { Database } from "bun:sqlite";
import { create } from "@bufbuild/protobuf";
import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import { CutoffClaimSchema } from "@night-shares/proto/market/v1/market_pb";
import { toProto } from "../../../shared/night-key";

export type ClaimRow = {
  night_key: string;
  human_id: string;
  size: bigint;
  amount: bigint;
  average: bigint;
  ready: bigint;
  busy: bigint;
  claimed_at: bigint | null;
};
export function cutoffClaims(db: Database, humanId: string) {
  return db
    .query<ClaimRow, [string]>(
      "SELECT * FROM market_cutoff_claims WHERE human_id = ? AND ready = 1 ORDER BY night_key",
    )
    .all(humanId);
}
export function claimProto(row: ClaimRow) {
  return create(CutoffClaimSchema, {
    night: toProto(row.night_key),
    size: { tenths: Number(row.size) },
    amount: { micros: row.amount },
    claimedAt:
      row.claimed_at === null
        ? undefined
        : timestampFromMs(Number(row.claimed_at)),
  });
}
