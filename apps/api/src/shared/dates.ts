import { DomainError } from "./errors/domain-error";

const DAY = 86_400_000;
export function parseDate(date: string): number {
  const ms = Date.parse(`${date}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(ms) ||
    new Date(ms).toISOString().slice(0, 10) !== date
  ) {
    throw new DomainError("INVALID_ARGUMENT", "Use a valid YYYY-MM-DD date.");
  }
  return ms;
}
export function addDays(date: string, days: number): string {
  if (!Number.isInteger(days))
    throw new DomainError("INVALID_ARGUMENT", "Days must be an integer.");
  return new Date(parseDate(date) + days * DAY).toISOString().slice(0, 10);
}
export function diffDays(start: string, end: string): number {
  return (parseDate(end) - parseDate(start)) / DAY;
}
export function range(start: string, end: string): string[] {
  const count = diffDays(start, end);
  if (count < 0)
    throw new DomainError("INVALID_ARGUMENT", "End must not precede start.");
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}
