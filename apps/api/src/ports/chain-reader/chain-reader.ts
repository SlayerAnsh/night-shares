import type { Address, Hex, TransactionReceipt } from "viem";
import type { ForkClient } from "../arc-deployment/validate";
import type { ChainCommand } from "../chain-executor/chain-executor";
export type BlockStamp = { number: bigint; hash: Hex; timestamp: bigint };
export type ReadRequest = {
  contract: string;
  functionName: string;
  args?: readonly unknown[];
  night?: Hex;
};
export type Snapshot<T = unknown> = { block: BlockStamp; value: T };
export interface ChainReader {
  readonly fingerprint: string;
  readonly client?: ForkClient;
  head(): Promise<BlockStamp>;
  assertCurrent(): Promise<void>;
  read<T = unknown>(
    request: ReadRequest,
    blockNumber?: bigint,
  ): Promise<Snapshot<T>>;
  cash(
    address: Address,
    blockNumber?: bigint,
  ): Promise<Snapshot<{ native: bigint; usdc: bigint }>>;
  tokenOf(night: Hex, blockNumber?: bigint): Promise<Address>;
  simulate(command: ChainCommand, sender: Address): Promise<Snapshot>;
  ingest(receipt: TransactionReceipt): Promise<void>;
  poll(maxBlocks?: number): Promise<BlockStamp>;
  watch(key: string, request: ReadRequest): void;
}
