// Display formatting for the trade screens. Money arrives as bigint micro USDC
// and is only turned into a float here, at the edge, for rounding to the screen.
export type Tone = "pos" | "neg" | "flat";

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const DAYS = "Sun Mon Tue Wed Thu Fri Sat".split(" ");
const MINUS = "−";

const dollars = (micros: bigint) => Number(micros) / 1e6;

export function usd(micros: bigint | undefined, decimals: 0 | 2 = 0) {
  if (micros === undefined) return "n/a";
  const n = dollars(micros);
  const text = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: Math.abs(n) > 0 && Math.abs(n) < 1 ? 4 : decimals,
  });
  return `${n < 0 && text !== "0" ? "-" : ""}$${text}`;
}

export function usdCompact(micros: bigint) {
  const n = dollars(micros);
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e4) return `$${(n / 1e3).toFixed(1)}k`;
  return usd(micros);
}

export function signedUsd(micros: bigint | undefined) {
  if (micros === undefined) return "n/a";
  if (micros > -500000n && micros < 500000n) return "$0";
  return `${micros > 0n ? "+" : MINUS}${usd(micros < 0n ? -micros : micros)}`;
}

export function signedPercent(bps: number | undefined, decimals = 1) {
  if (bps === undefined || !Number.isFinite(bps) || Math.abs(bps) > 1000000)
    return "n/a";
  const text = (Math.abs(bps) / 100).toFixed(decimals);
  if (Number(text) === 0) return `${text}%`;
  return `${bps > 0 ? "+" : MINUS}${text}%`;
}

export function signedRatio(ratio: number, decimals = 1) {
  return signedPercent(Math.round(ratio * 10000), decimals);
}

export function tone(n: number | bigint, epsilon = 0): Tone {
  const value = typeof n === "bigint" ? Number(n) : n;
  if (value > epsilon) return "pos";
  if (value < -epsilon) return "neg";
  return "flat";
}

// Ask compared with the predicted fair price: negative means below fair.
export function fairDelta(price?: bigint, fair?: bigint): number | null {
  if (price === undefined || !fair) return null;
  return Number(price) / Number(fair) - 1;
}

export function fairText(delta: number | null) {
  if (delta === null) return "n/a";
  if (Math.abs(delta) < 0.02) return "Near";
  return signedRatio(delta, 0);
}

export function fairTone(delta: number | null): Tone {
  if (delta === null || Math.abs(delta) < 0.02) return "flat";
  return delta < 0 ? "pos" : "neg";
}

function isoDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`);
}

export function shortDate(iso: string) {
  const d = isoDate(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function weekdayDate(iso: string) {
  const d = isoDate(iso);
  return `${DAYS[d.getUTCDay()]}, ${shortDate(iso)}`;
}

export function hoursUntil(atSeconds: bigint | undefined, now: number) {
  if (atSeconds === undefined) return null;
  return (Number(atSeconds) * 1000 - now) / 3600000;
}

export function releaseShort(hours: number | null) {
  if (hours === null) return "n/a";
  if (hours >= 24) return `${Math.floor(hours / 24)}d`;
  return `${Math.max(0, Math.floor(hours))}h`;
}

export function releaseLong(hours: number | null) {
  if (hours === null) return "n/a";
  if (hours <= 0) return "Released";
  const days = Math.floor(hours / 24);
  const rest = Math.floor(hours % 24);
  return days
    ? `${days}d ${rest}h`
    : `${rest}h ${Math.floor((hours * 60) % 60)}m`;
}

export function clockTime(atSeconds: bigint | undefined) {
  if (atSeconds === undefined) return "n/a";
  const d = new Date(Number(atSeconds) * 1000);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

// Proto scalar defaults are zero; absent fairPrice identifies an unavailable forecast.
export function forecastReturn(card: {
  fairPrice?: { micros: bigint };
  price?: { micros: bigint };
  estimatedReturnBps: number;
}) {
  return card.fairPrice && (card.price?.micros ?? 0n) >= 10000n
    ? card.estimatedReturnBps
    : undefined;
}
