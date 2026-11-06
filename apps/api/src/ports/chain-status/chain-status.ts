import type { Ports } from "../../container/ports";
import { DomainError } from "../../shared/errors/domain-error";
export interface ChainStatus {
  isPaused(nightKey?: string): boolean;
}
const settings = new WeakMap<
  Ports,
  { status: ChainStatus; limits: boolean; threshold: bigint }
>();
export function configureChainStatus(
  ports: Ports,
  status: ChainStatus,
  limits = false,
  threshold = limits ? 10_000_000n : 1_000_000_000n,
) {
  settings.set(ports, { status, limits, threshold });
}
export function chainStatus(ports: Ports): ChainStatus {
  return settings.get(ports)?.status ?? { isPaused: () => false };
}
export function chainLimits(ports: Ports) {
  return settings.get(ports)?.limits ?? false;
}
export function approvalThreshold(ports: Ports) {
  return settings.get(ports)?.threshold ?? 1_000_000_000n;
}
export function assertTrading(ports: Ports, key?: string) {
  if (chainStatus(ports).isPaused(key))
    throw new DomainError("FAILED_PRECONDITION", "Trading is paused.");
}
