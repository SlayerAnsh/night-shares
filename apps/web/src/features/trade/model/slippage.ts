// The API defaults on-chain slippage to 50 basis points (0.5%).
export const DEFAULT_SLIPPAGE_BPS = 50;

export const slippageLabel = (bps = DEFAULT_SLIPPAGE_BPS) =>
  `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

/**
 * The price limit sent with an order: a buy pays at most the quote plus the
 * slippage, a sell receives at least the quote minus it. Rounding matches the
 * API (up for the buy ceiling, down for the sell floor), so the two agree.
 */
export function priceLimit(
  total: bigint,
  side: "buy" | "sell",
  bps = DEFAULT_SLIPPAGE_BPS,
): bigint {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000 || total < 0n)
    throw new RangeError("Slippage must be 0 to 10000 basis points.");
  return side === "buy"
    ? (total * BigInt(10000 + bps) + 9999n) / 10000n
    : (total * BigInt(10000 - bps)) / 10000n;
}
