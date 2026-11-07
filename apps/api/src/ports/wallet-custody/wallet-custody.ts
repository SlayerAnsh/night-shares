import type { TypedDataDefinition } from "viem";

export type WalletOwner =
  | { kind: "user"; humanId: string }
  | { kind: "system"; name: string };
export type CustodyWallet = { walletId: string; address: `0x${string}` };
export type WalletTypedData = TypedDataDefinition;
export type TransactionEnvelope = {
  chainId: number;
  type: "eip1559";
  nonce: number;
  to: `0x${string}`;
  data: `0x${string}`;
  value: bigint;
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
};
export interface WalletCustody {
  resolveWallet?(walletId: string): Promise<CustodyWallet>;
  signTransaction?(
    walletId: string,
    transaction: TransactionEnvelope,
  ): Promise<`0x${string}`>;
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
