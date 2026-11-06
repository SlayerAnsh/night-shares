import type { TypedDataDefinition } from "viem";

export type WalletOwner =
  | { kind: "user"; humanId: string }
  | { kind: "system"; name: string };
export type CustodyWallet = { walletId: string; address: `0x${string}` };
export type WalletTypedData = TypedDataDefinition;
export interface WalletCustody {
  createWallet(owner: WalletOwner): Promise<CustodyWallet>;
  getWallet(owner: WalletOwner): Promise<CustodyWallet | undefined>;
  signTypedData(
    walletId: string,
    typedData: WalletTypedData,
  ): Promise<`0x${string}`>;
}
export function ownerKey(owner: WalletOwner): string {
  return `${owner.kind}:${owner.kind === "user" ? owner.humanId : owner.name}`;
}
