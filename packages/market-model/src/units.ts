// Decimal rounding avoids binary multiplication moving a half-micro tie downward.
export function toMicros(usd: number): bigint {
  if (!Number.isFinite(usd)) throw new RangeError("USD must be finite");
  const [coefficient = "0", exponent = "0"] = Math.abs(usd)
    .toString()
    .split("e");
  const [whole = "0", fraction = ""] = coefficient.split(".");
  const digits = BigInt(whole + fraction);
  const shift = 6 + Number(exponent) - fraction.length;
  const divisor = 10n ** BigInt(Math.max(0, -shift));
  const rounded =
    shift >= 0
      ? digits * 10n ** BigInt(shift)
      : (digits + divisor / 2n) / divisor;
  return usd < 0 ? -rounded : rounded;
}

export function toTenths(roomNights: number): number {
  return Math.sign(roomNights) * Math.round(Math.abs(roomNights) * 10);
}

export function fromTenths(tenths: number): number {
  return tenths / 10;
}
