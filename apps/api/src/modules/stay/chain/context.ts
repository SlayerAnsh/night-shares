import { decodeEventLog, type Hex } from "viem";
import { envValue } from "../../../config/env";
import type { Ports } from "../../../container/ports";
import type { ArcDeployment } from "../../../ports/arc-deployment/arc-deployment";
import {
  deserialize,
  type ExecutionResult,
} from "../../../ports/chain-executor/chain-executor";
import { DomainError } from "../../../shared/errors/domain-error";

export function chainContext(ports: Ports) {
  const executor = ports.chainExecutor;
  const reader = ports.chainReader;
  const custody = ports.walletProvider.custody;
  if (!executor || executor.mode === "mock" || !reader || !custody)
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Chain booking dependencies are unavailable.",
    );
  // This is the validated deployment loaded at startup, never a second file read.
  const row = ports.db
    .query<{ deployment: string }, [string]>(
      "SELECT deployment FROM chain_instances WHERE fingerprint = ? AND active = 1",
    )
    .get(reader.fingerprint);
  if (!row)
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Active deployment is unavailable.",
    );
  return {
    executor,
    reader,
    custody,
    deployment: deserialize<ArcDeployment>(row.deployment),
  };
}

export function confirmed(result: ExecutionResult) {
  if (result.state === "reverted")
    throw new DomainError("FAILED_PRECONDITION", "Chain transaction reverted.");
  if (result.state !== "finalized" || result.receipt?.status !== "success")
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Chain transaction is pending reconciliation. Retry the same request.",
    );
  return result.receipt;
}

export function receiptEvents<T>(
  result: ExecutionResult,
  deployment: ArcDeployment,
  contract: string,
  name: string,
): T[] {
  const receipt = confirmed(result);
  const address = deployment[contract as "BookingRouter"];
  return receipt.logs.flatMap((log) => {
    if (log.address.toLowerCase() !== address.toLowerCase()) return [];
    try {
      const event = decodeEventLog({
        abi: deployment.abis[contract] ?? [],
        data: log.data,
        topics: log.topics,
      });
      return event.eventName === name ? [event.args as T] : [];
    } catch {
      return [];
    }
  });
}

export type ChainBooking = {
  night: Hex;
  guest: Hex;
  qty: bigint;
  paid: bigint;
  checkIn: bigint;
};

export function slippageBound(
  paid: bigint,
  cap: bigint,
  bps = Number(envValue("BOOKING_SLIPPAGE_BPS") ?? 50),
) {
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 10000)
    throw new DomainError(
      "FAILED_PRECONDITION",
      "BOOKING_SLIPPAGE_BPS must be between 0 and 10000.",
    );
  const maximum = paid + (paid * BigInt(bps)) / 10000n;
  return maximum < cap ? maximum : cap;
}
