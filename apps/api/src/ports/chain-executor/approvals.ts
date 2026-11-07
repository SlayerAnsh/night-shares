import type { Address } from "viem";
import type { ArcDeployment } from "../arc-deployment/arc-deployment";
import type { ChainReader } from "../chain-reader/chain-reader";
import { allowanceSnapshot } from "../chain-reader/snapshots";
import type { ChainExecutor, ExecutionResult } from "./chain-executor";
/** Call before the router operation, outside any SQLite transaction. Each renewal has its own durable ID. */
export async function ensureRouterAllowance(deps: {
  executor: ChainExecutor;
  reader: ChainReader;
  deployment: ArcDeployment;
  operationId: string;
  walletId: string;
  owner: Address;
  router: "TradeRouter" | "BookingRouter";
  amount: bigint;
  expiration: number;
}): Promise<ExecutionResult[]> {
  const { deployment: d } = deps;
  if (
    deps.amount <= 0n ||
    deps.amount >= 2n ** 160n ||
    !Number.isSafeInteger(deps.expiration) ||
    deps.expiration >= 2 ** 48
  )
    throw new Error("Invalid bounded Permit2 allowance.");
  const snapshot = await allowanceSnapshot(
    deps.reader,
    deps.owner,
    d.USDC,
    d.PERMIT2,
    d[deps.router],
  );
  if (BigInt(deps.expiration) <= snapshot.block.timestamp)
    throw new Error("Allowance expiration must be in the future.");
  const results: ExecutionResult[] = [];
  if (snapshot.value.erc20 < deps.amount) {
    const result = await deps.executor.execute({
      operationId: `${deps.operationId}:approve-usdc`,
      walletId: deps.walletId,
      command: { kind: "approveUsdc", amount: deps.amount },
    });
    results.push(result);
    if (result.state !== "finalized") return results;
  }
  if (
    snapshot.value.permit2 < deps.amount ||
    snapshot.value.expiration < deps.expiration
  )
    results.push(
      await deps.executor.execute({
        operationId: `${deps.operationId}:approve-permit2`,
        walletId: deps.walletId,
        command: {
          kind: "approvePermit2",
          router: deps.router,
          amount: deps.amount,
          expiration: deps.expiration,
        },
      }),
    );
  return results;
}
