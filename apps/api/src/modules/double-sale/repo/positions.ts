import type { Database } from "bun:sqlite";
export type Holder = {
  human_id: string;
  id: string;
  wallet_address: string;
  free: bigint;
  escrow: bigint;
  average: bigint;
  realised: bigint;
};
export function holders(db: Database, key: string) {
  return db
    .query<
      Holder,
      [string]
    >(`SELECT p.human_id, h.id, h.wallet_address, p.free, p.escrow, p.average, p.realised
    FROM market_positions p JOIN market_holders h USING (human_id)
    WHERE p.night_key = ? AND (p.free > 0 OR p.escrow > 0)`)
    .all(key);
}
export function redeem(
  db: Database,
  key: string,
  holder: Holder,
  amount: bigint,
  size: number,
) {
  db.query(
    "UPDATE market_positions SET free = 0, escrow = 0, realised = realised + ? WHERE human_id = ? AND night_key = ?",
  ).run(amount - (holder.average * BigInt(size)) / 10n, holder.human_id, key);
}
export function restore(db: Database, key: string, holder: Holder) {
  db.query(
    "UPDATE market_positions SET free = ?, escrow = ?, realised = ? WHERE human_id = ? AND night_key = ?",
  ).run(holder.free, holder.escrow, holder.realised, holder.human_id, key);
}
