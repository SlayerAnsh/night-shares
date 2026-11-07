import type { Address, Hex, TransactionReceipt } from "viem";
export type Order = {
  night: Hex;
  size: bigint;
  price: bigint;
  expiry: bigint;
  nonce: bigint;
  maker: Address;
};
export type Ask = { order: Order; signature: Hex; qty: bigint };
export type Hint = { account: Address; prev: Address; next: Address };
export type NightConfig = {
  F: bigint;
  k: bigint;
  S: bigint;
  X: bigint;
  cutoff: bigint;
  host: Address;
  property: Hex;
  roomType: Hex;
  night: Hex;
  checkIn: bigint;
};
export type WalkAttestation = {
  reportId: Hex;
  bookingId: Hex;
  property: Hex;
  guest: Address;
  paid: bigint;
  evidenceHash: Hex;
  reportedAt: bigint;
  deadline: bigint;
};
type Routing = { night: Hex; asks: Ask[]; hints: Hint[]; deadline: bigint };
export type ChainCommand =
  | ({ kind: "buy"; qty: bigint; maxPaid: bigint } & Routing)
  | {
      kind: "sell";
      night: Hex;
      qty: bigint;
      minReceived: bigint;
      hints: Hint[];
      deadline: bigint;
    }
  | ({ kind: "book"; maxPrice: bigint } & Routing)
  | {
      kind: "open";
      propertyId: string;
      roomTypeId: string;
      date: string;
      config: NightConfig;
      salt: Hex;
    }
  | { kind: "addChunk"; night: Hex; fromRoom: bigint; toRoom: bigint }
  | { kind: "cancelAll" }
  | { kind: "sweep" | "settleCutoff" | "claim"; night: Hex }
  | { kind: "pushBatch"; night: Hex; count: bigint }
  | {
      kind: "withdrawCredit";
      contract: "NightToken" | "NightHook" | "Settlement";
      night?: Hex;
      recipient: Address;
    }
  | {
      kind: "link" | "relink";
      humanId: bigint;
      wallet: Address;
      deadline: bigint;
      signature: Hex;
    }
  | { kind: "verifyHuman"; humanId: bigint; orb: boolean }
  | {
      kind: "bind";
      property: Hex;
      hostPayout: Address;
      deadline: bigint;
      signature: Hex;
    }
  | { kind: "reportWalk"; report: WalkAttestation; signature: Hex }
  | { kind: "transfer"; to: Address; amount: bigint }
  | { kind: "approveUsdc"; amount: bigint }
  | {
      kind: "approvePermit2";
      router: "TradeRouter" | "BookingRouter";
      amount: bigint;
      expiration: number;
    }
  | { kind: "approveToken"; night: Hex; amount: bigint }
  | { kind: "provisionToken"; to: Address; amount: bigint };
export type OperationState =
  | "prepared"
  | "signed"
  | "submitted"
  | "mined"
  | "finalized"
  | "reverted"
  | "needs_reconciliation";
export type ExecutionRequest = {
  operationId: string;
  walletId: string;
  command: ChainCommand;
};
export type ExecutionResult = {
  operationId: string;
  fingerprint: string;
  state: OperationState;
  hash?: Hex;
  receipt?: TransactionReceipt;
};
export interface ChainExecutor {
  readonly mode: "mock" | "fork";
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
  recover(operationId: string): Promise<ExecutionResult>;
  pending(): string[];
}
/** Use explicit seconds at the port boundary. */
export function soliditySeconds(milliseconds: number): bigint {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0)
    throw new Error("Invalid timestamp.");
  return BigInt(Math.floor(milliseconds / 1000));
}
export function tokenTenths(tenths: number): bigint {
  if (!Number.isSafeInteger(tenths) || tenths < 0)
    throw new Error("Invalid token quantity.");
  return BigInt(tenths) * 100_000_000_000_000_000n;
}
export const serialize = (value: unknown): string =>
  JSON.stringify(value, (_, item) =>
    typeof item === "bigint" ? { $bigint: item.toString() } : item,
  );
export const deserialize = <T>(value: string): T =>
  JSON.parse(value, (_, item) =>
    item &&
    typeof item === "object" &&
    Object.keys(item).length === 1 &&
    typeof item.$bigint === "string"
      ? BigInt(item.$bigint)
      : item,
  ) as T;
