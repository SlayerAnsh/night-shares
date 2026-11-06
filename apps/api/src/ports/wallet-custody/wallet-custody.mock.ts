import { createHash } from "node:crypto";
import { DomainError } from "../../shared/errors/domain-error";
import {
  type CustodyWallet,
  ownerKey,
  type WalletCustody,
} from "./wallet-custody";

export function createMockWalletCustody(): WalletCustody {
  const wallets = new Map<string, CustodyWallet>();
  return {
    async getWallet(owner) {
      return wallets.get(ownerKey(owner));
    },
    async createWallet(owner) {
      const key = ownerKey(owner);
      let wallet = wallets.get(key);
      if (!wallet) {
        const seed = owner.kind === "user" ? owner.humanId : key;
        wallet = {
          walletId: `mock:${key}`,
          address: `0x${createHash("sha256").update(seed).digest("hex").slice(0, 40)}`,
        };
        wallets.set(key, wallet);
      }
      return { ...wallet };
    },
    async signTypedData() {
      throw new DomainError(
        "FAILED_PRECONDITION",
        "Mock wallets use the mock order signer.",
      );
    },
  };
}
