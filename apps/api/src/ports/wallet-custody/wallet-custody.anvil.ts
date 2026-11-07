import type { Database } from "bun:sqlite";
import { mnemonicToAccount } from "viem/accounts";
import type { ArcDeployment } from "../arc-deployment/arc-deployment";
import { assertLocalForkRpc } from "../arc-deployment/local-fork";
import {
  type CustodyWallet,
  ownerKey,
  type WalletCustody,
} from "./wallet-custody";

export const ANVIL_MNEMONIC =
  "test test test test test test test test test test test junk";
export const anvilAccount = (index: number) =>
  mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: index });
export function createAnvilWalletCustody(deps: {
  db: Database;
  network: string;
  deployment: ArcDeployment;
  rpcUrl: string;
  faucet?: boolean;
  provision?: (wallet: CustodyWallet) => Promise<void>;
}): WalletCustody {
  if (deps.network !== "fork")
    throw new Error("Anvil custody requires ARC_NETWORK=fork.");
  assertLocalForkRpc(deps.rpcUrl);
  const { db } = deps;
  // This adapter owns its local development allocation store, independent of production custody.
  db.exec(`CREATE TABLE IF NOT EXISTS anvil_wallets (
    owner TEXT PRIMARY KEY, derivation_index INTEGER NOT NULL UNIQUE CHECK (derivation_index >= 100),
    wallet_id TEXT NOT NULL UNIQUE, address TEXT NOT NULL UNIQUE
  )`);
  const get = (owner: string) =>
    db
      .query<CustodyWallet, [string]>(
        "SELECT wallet_id AS walletId, address FROM anvil_wallets WHERE owner = ?",
      )
      .get(owner) ?? undefined;
  const allocate = db.transaction((owner: string) => {
    const existing = get(owner);
    if (existing) return { wallet: existing, created: false };
    const index = db
      .query<{ next: number }, []>(
        "SELECT COALESCE(MAX(derivation_index) + 1, 100) AS next FROM anvil_wallets",
      )
      .get()?.next;
    if (index === undefined)
      throw new Error("Cannot allocate Anvil wallet index.");
    const wallet = {
      walletId: `anvil:${index}`,
      address: anvilAccount(Number(index)).address,
    };
    db.query("INSERT INTO anvil_wallets VALUES (?, ?, ?, ?)").run(
      owner,
      index,
      wallet.walletId,
      wallet.address,
    );
    return { wallet, created: true };
  });
  const accountFor = (walletId: string) => {
    const row = db
      .query<{ index: number | bigint }, [string]>(
        "SELECT derivation_index AS 'index' FROM anvil_wallets WHERE wallet_id = ?",
      )
      .get(walletId);
    if (!row) throw new Error("Unknown anvil custody wallet.");
    return anvilAccount(Number(row.index));
  };
  return {
    async resolveWallet(walletId) {
      return { walletId, address: accountFor(walletId).address };
    },
    async signTransaction(walletId, transaction) {
      return accountFor(walletId).signTransaction(transaction);
    },
    async getWallet(owner) {
      return get(ownerKey(owner));
    },
    async createWallet(owner) {
      const { wallet } = allocate.immediate(ownerKey(owner));
      if (deps.faucet) {
        if (!deps.provision)
          throw new Error("Fork faucet requires durable provisioning.");
        await deps.provision(wallet);
      }
      return wallet;
    },
    async signTypedData(walletId, data) {
      const row = db
        .query<{ index: number }, [string]>(
          "SELECT derivation_index AS 'index' FROM anvil_wallets WHERE wallet_id = ?",
        )
        .get(walletId);
      if (!row) throw new Error("Unknown anvil custody wallet.");
      return anvilAccount(Number(row.index)).signTypedData(data);
    },
  };
}
