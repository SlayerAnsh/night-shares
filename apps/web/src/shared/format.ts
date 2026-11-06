export function formatUsdc(
  micros: bigint,
  options: { decimals?: 0 | 2 | 6; suffix?: boolean } = {},
): string {
  const decimals = options.decimals ?? 2;
  const divisor = 10n ** BigInt(6 - decimals);
  const absolute = micros < 0n ? -micros : micros;
  const rounded = (absolute + divisor / 2n) / divisor;
  const scale = 10n ** BigInt(decimals);
  const whole = (rounded / scale).toLocaleString("en-US");
  const fraction = decimals
    ? `.${(rounded % scale).toString().padStart(decimals, "0")}`
    : "";
  return `${micros < 0n && rounded !== 0n ? "-" : ""}${whole}${fraction}${options.suffix === false ? "" : " USDC"}`;
}
export function formatRoomNights(tenths: number): string {
  if (!Number.isSafeInteger(tenths))
    throw new RangeError("Room nights must be integer tenths.");
  return (tenths / 10).toLocaleString("en-US", { maximumFractionDigits: 1 });
}
export function formatNight(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new RangeError("Night must be an ISO date.");
  const night = new Date(`${date}T00:00:00Z`);
  if (
    Number.isNaN(night.getTime()) ||
    night.toISOString().slice(0, 10) !== date
  )
    throw new RangeError("Night must be a valid date.");
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(night);
}
