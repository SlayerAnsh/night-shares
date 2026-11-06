export type NightRange = { checkIn: string; checkOut: string };

// A first click starts a new stay. A later night closes it. A click on or
// before check-in starts over from that night.
export function pickNight(range: NightRange, date: string): NightRange {
  if (!range.checkIn || range.checkOut || date <= range.checkIn)
    return { checkIn: date, checkOut: "" };
  return { checkIn: range.checkIn, checkOut: date };
}

export type PriceTier = "lo" | "mid" | "hi";

// Cheapest 30 percent of the visible nights read as "lower than usual", the
// top quarter as high, as in the mock calendar.
export function priceTiers(prices: bigint[]): (price: bigint) => PriceTier {
  const sorted = [...prices].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const lo = sorted[Math.floor(sorted.length * 0.3)] ?? 0n;
  const hi = sorted[Math.floor(sorted.length * 0.75)] ?? 0n;
  return (price) => (price <= lo ? "lo" : price >= hi ? "hi" : "mid");
}

// Compact calendar label: 718 USDC reads "718", 1,240 reads "1.2k".
export function compactPrice(micros: bigint): string {
  const whole = Number(micros / 1_000_000n);
  return whole >= 1000 ? `${(whole / 1000).toFixed(1)}k` : String(whole);
}
