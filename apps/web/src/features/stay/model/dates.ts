// Calendar math on ISO nights (YYYY-MM-DD). All dates are UTC midnights so the
// local time zone never shifts a night.
const DAY = 86_400_000;

export function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// Today in the guest's own calendar, as an ISO night.
export function localToday(now = new Date()): string {
  return isoDate(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function parseIso(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function addNights(date: string, nights: number): string {
  return isoDate(parseIso(date) + nights * DAY);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((parseIso(checkOut) - parseIso(checkIn)) / DAY);
}

// First of the month `offset` months after the month holding `date`.
export function monthStart(date: string, offset = 0): string {
  const d = new Date(parseIso(date));
  return isoDate(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
}

// Cells for one month grid, Sunday first as in the mock. Null cells pad the first week.
export function monthCells(first: string): (string | null)[] {
  const d = new Date(parseIso(first));
  const lead = d.getUTCDay();
  const days = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let i = 0; i < days; i++) cells.push(addNights(first, i));
  return cells;
}

const short = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const weekday = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const month = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export const formatShort = (date: string) => short.format(parseIso(date));
export const formatWeekday = (date: string) => weekday.format(parseIso(date));
export const formatMonth = (date: string) => month.format(parseIso(date));

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
