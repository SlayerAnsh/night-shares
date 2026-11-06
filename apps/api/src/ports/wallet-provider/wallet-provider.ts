import type { WalletCustody } from "../wallet-custody/wallet-custody";
export type WalletTransaction = {
  id: string;
  at: number;
  from: string;
  to: string;
  amount: bigint;
  memo: string;
  direction: "in" | "out";
};
export type SettlementLeg = {
  from: string;
  to: string;
  amount: bigint;
  memo: string;
};
export interface WalletProvider {
  custody?: WalletCustody;
  onchainUsdcBalance?: (address: string) => Promise<bigint | null>;
  explorerUrl?: string;
  settle(legs: SettlementLeg[]): Promise<string[]>;
  linkWallet(humanId: string): Promise<string>;
  balance(address: string): Promise<bigint>;
  transactions(address: string): Promise<WalletTransaction[]>;
  transfer(
    from: string,
    to: string,
    amount: bigint,
    memo: string,
  ): Promise<string>;
}
export const SYSTEM_ADDRESSES = {
  treasury: "treasury",
  coverFund: "cover_fund",
  pool: "pool",
  host: "host",
  marketMaker: "market_maker",
  cutoffClaims: "cutoff_claims",
  rebatePool: "rebate_pool",
} as const;
