import { cost, toMicros } from "@night-shares/market-model";
import { DomainError } from "../../shared/errors/domain-error";

// These immutable limits mirror NightFactory constructor arguments on chain 5042.
export const MAX_F = 1_000_000n;
export const MAX_POOL = 50_000_000n;
export const MAX_S = 100;
export const MAX_OPEN_NIGHTS = 20;

export function assertChainPrices(state: { F: number; k: number; S: number }) {
  const floor = toMicros(state.F);
  const pool = toMicros(cost(state.F, state.k, state.S, 0, state.S));
  for (const [label, value, limit] of [
    ["Floor price", floor, MAX_F],
    ["Full ladder cost", pool, MAX_POOL],
  ] as const) {
    if (value > limit)
      throw new DomainError(
        "INVALID_ARGUMENT",
        `${label} ${(Number(value) / 1e6).toFixed(2)} USDC is above the ${(Number(limit) / 1e6).toFixed(2)} USDC mainnet limit.`,
      );
  }
}
