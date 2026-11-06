export interface WalletProvider {
  linkWallet(humanId: string): Promise<string>;
  balance(address: string): Promise<bigint>;
  transfer(
    from: string,
    to: string,
    amount: bigint,
    memo: string,
  ): Promise<string>;
}
export const SYSTEM_ADDRESSES = {
  treasury: "treasury",
  pool: "pool",
  host: "host",
} as const;
