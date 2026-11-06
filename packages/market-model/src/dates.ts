// UTC represents calendar fields only, so host timezone cannot change a night.
export function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 864e5);
}
