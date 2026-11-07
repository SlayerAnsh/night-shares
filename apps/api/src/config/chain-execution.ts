import { DomainError } from "../shared/errors/domain-error";

export function executionEnabled(config: {
  chainExecution?: boolean;
  chain?: { network: string };
  arcNetwork?: string;
}): boolean {
  return (
    config.chainExecution ??
    (config.chain?.network ?? config.arcNetwork) !== "mainnet"
  );
}

export function assertChainExecution(enabled: boolean): void {
  if (!enabled)
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Chain execution is disabled (CHAIN_EXECUTION=off).",
    );
}
