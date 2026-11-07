// Stable wire reasons for existing domain failures. Messages remain unchanged.
const rules = [
  ["CANCEL_PENDING", /cancellation.*pending/i],
  ["PENDING_RECONCILIATION", /pending reconciliation|is pending\b/i],
  ["SLIPPAGE", /price moved|slippage/i],
  ["REVERTED", /reverted/i],
  ["TRADING_PAUSED", /paused/i],
  ["CAP_EXCEEDED", /cap exceeded/i],
  ["LIQUIDITY", /not enough (trader )?liquidity|not enough room nights/i],
  ["INSUFFICIENT_USDC", /insufficient usdc/i],
  ["ONE_ROOM_ONE_NIGHT", /exactly 1 room for 1 night/i],
] as const;
export type ErrorReason = (typeof rules)[number][0];
export function errorReason(message: string): ErrorReason | undefined {
  return rules.find(([, pattern]) => pattern.test(message))?.[0];
}
