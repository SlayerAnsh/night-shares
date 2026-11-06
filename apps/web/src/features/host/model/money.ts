import { formatUsdc } from "../../../shared/format";

/** Whole USDC with a dollar sign, for tiles and calendar cells: "$1,226". */
export function usd(micros?: bigint) {
  return `$${formatUsdc(micros ?? 0n, { decimals: 0, suffix: false })}`;
}

/** Share as a whole percent: "26%". */
export function pct(part: number, whole: number) {
  return `${whole ? Math.round((part * 100) / whole) : 0}%`;
}
