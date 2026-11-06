import type { Database } from "bun:sqlite";
import { secp256k1 } from "@noble/curves/secp256k1";
import { hashTypedData } from "viem";
import { publicKeyToAddress } from "viem/accounts";
import { DomainError } from "../../shared/errors/domain-error";
import type {
  WalletCustody,
  WalletTypedData,
} from "../wallet-custody/wallet-custody";
import type { AsyncOrderSigner } from "./order-signer";

export function createPrivyOrderSigner(deps: {
  db: Database;
  custody: WalletCustody;
}): AsyncOrderSigner {
  return {
    async signCustodial(maker: string, digest: string, typedDataJson: string) {
      const typedData = JSON.parse(typedDataJson) as WalletTypedData;
      if (hashTypedData(typedData) !== digest)
        throw new DomainError(
          "INVALID_ARGUMENT",
          "Order typed data does not match its digest.",
        );
      const wallet = deps.db
        .query<{ walletId: string }, [string]>(
          "SELECT wallet_id AS walletId FROM wallet_custody WHERE provider = 'privy' AND lower(address) = lower(?)",
        )
        .get(maker);
      if (!wallet)
        throw new DomainError(
          "FAILED_PRECONDITION",
          "This account has no Privy signing wallet.",
        );
      return deps.custody.signTypedData(wallet.walletId, typedData);
    },
    verify(
      maker: string,
      digest: string,
      signature: string,
      typedDataJson: string,
    ) {
      try {
        const typedData = JSON.parse(typedDataJson) as WalletTypedData;
        if (hashTypedData(typedData) !== digest) return false;
        if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return false;
        const v = Number.parseInt(signature.slice(130), 16);
        const recovery = v >= 27 ? v - 27 : v;
        if (recovery !== 0 && recovery !== 1) return false;
        // Recovery is synchronous so verification stays inside the SQLite transaction.
        const publicKey = secp256k1.Signature.fromCompact(
          signature.slice(2, 130),
        )
          .addRecoveryBit(recovery)
          .recoverPublicKey(digest.slice(2))
          .toHex(false);
        const recovered = publicKeyToAddress(`0x${publicKey}`);
        return recovered.toLowerCase() === maker.toLowerCase();
      } catch {
        return false;
      }
    },
  };
}
