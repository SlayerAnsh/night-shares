import type { Database } from "bun:sqlite";
export type SignedAsk = {
  night_key: string;
  maker: string;
  human_id: string;
  size: bigint;
  remaining: bigint;
  price: bigint;
  expiry: bigint;
  nonce: bigint;
  digest: string;
  signature: string;
  status: string;
};
export function makerNonce(db: Database, maker: string) {
  return (
    db
      .query<{ nonce: bigint }, [string]>(
        "SELECT nonce FROM market_maker_nonces WHERE maker = ?",
      )
      .get(maker)?.nonce ?? 0n
  );
}
export function signedAsks(db: Database, key: string) {
  return db
    .query<SignedAsk, [string]>(
      "SELECT * FROM market_signed_asks WHERE night_key = ?",
    )
    .all(key);
}
export function isLive(db: Database, ask: SignedAsk, now: number) {
  return (
    ask.status === "open" &&
    ask.remaining > 0n &&
    ask.expiry > BigInt(now) &&
    ask.nonce === makerNonce(db, ask.maker)
  );
}
