import type { Database } from "bun:sqlite";
import {
  type CustodyWallet,
  ownerKey,
  type WalletCustody,
} from "./wallet-custody";

export function persistWalletCustody(
  db: Database,
  mode: "mock" | "privy",
  adapter: WalletCustody,
): WalletCustody {
  const pending = new Map<string, Promise<CustodyWallet>>();
  const get = (key: string) =>
    db
      .query<CustodyWallet, [string, string]>(
        "SELECT wallet_id AS walletId, address FROM wallet_custody WHERE owner = ? AND provider = ?",
      )
      .get(key, mode) ?? undefined;
  return {
    async getWallet(owner) {
      return get(ownerKey(owner));
    },
    async createWallet(owner) {
      const key = ownerKey(owner);
      const existing = get(key);
      if (existing) return existing;
      const active = pending.get(key);
      if (active) return active;
      const creating = (async () => {
        const wallet = await adapter.createWallet(owner);
        db.query(
          "INSERT OR IGNORE INTO wallet_custody (owner, provider, wallet_id, address) VALUES (?, ?, ?, ?)",
        ).run(key, mode, wallet.walletId, wallet.address);
        return get(key) as CustodyWallet;
      })();
      pending.set(key, creating);
      try {
        return await creating;
      } finally {
        pending.delete(key);
      }
    },
    signTypedData: adapter.signTypedData,
  };
}
