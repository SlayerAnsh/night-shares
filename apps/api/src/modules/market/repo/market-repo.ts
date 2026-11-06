import type { AgentOrder } from "@night-shares/proto/market/v1/portfolio_pb";
import type { User } from "../../../ports/sessions/session-store";
export type Position = {
  free: number;
  average: bigint;
  realised: bigint;
  escrow: number;
  askPrice: bigint;
  closed: number;
  wins: number;
  returns: number;
};
export type Account = {
  positions: Map<string, Position>;
  watch: Set<string>;
  orders: Map<string, AgentOrder>;
};
export interface MarketRepo {
  remember(user: User): void;
  holders(key: string): User[];
  account(humanId: string): Account;
  position(humanId: string, key: string): Position;
  exclusive<T>(humanId: string, work: () => Promise<T>): Promise<T>;
}
