import { DomainError } from "./errors/domain-error";

export function assertIntegerTenths(tenths: number): void {
  if (!Number.isSafeInteger(tenths))
    throw new DomainError("INVALID_ARGUMENT", "Tenths must be a safe integer.");
}

// Tolerate floating point drift, never round a fractional token quantity.
export function toWholeTenths(rooms: number): number {
  const scaled = rooms * 10;
  const tenths = Math.round(scaled);
  assertIntegerTenths(tenths);
  if (Math.abs(scaled - tenths) > 1e-9)
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Room nights must be whole tenths.",
    );
  return tenths === 0 ? 0 : tenths;
}
