export interface TraderAsk {
  price: number;
  size: number;
  who?: string;
}
export interface PoolAsk {
  price: number;
  size: number;
  src: "pool";
  guestOnly: boolean;
}
export interface TraderLevel extends TraderAsk {
  src: "trader";
  guestOnly?: boolean;
}
export type Ask = PoolAsk | TraderLevel;
export interface Bid {
  price: number;
  net: number;
  size: number;
  src: "sell-back";
}
export interface Book {
  asks: Ask[];
  bids: Bid[];
  recall: number;
}
export interface BookInput {
  F: number;
  k: number;
  S: number;
  q: number;
  tranche?: number;
  traderAsks?: readonly TraderAsk[];
  levels?: number;
  hoursLeft?: number;
}
export type Fill =
  | (Ask & { take: number })
  | { price: number; take: number; src: "recall" };
export interface BuyResult {
  filled: number;
  avg: number;
  gross: number;
  total: number;
  fee: number;
  fills: Fill[];
}
