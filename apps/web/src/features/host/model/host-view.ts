import type {
  HostNight,
  Occupancy,
  Payout,
} from "@night-shares/proto/host/v1/hotel_pb";

export function datesBetween(start: string, end: string): string[] {
  const valid = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  if (!valid(start) || !valid(end) || end <= start) return [];
  const count = (Date.parse(end) - Date.parse(start)) / 86400000;
  if (count > 240) return [];
  return Array.from({ length: count }, (_, i) =>
    new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10),
  );
}

export function aggregateDays(nights: HostNight[]) {
  const days = new Map<
    string,
    {
      date: string;
      allotment: number;
      booked: number;
      held: number;
      onSale: number;
    }
  >();
  for (const night of nights) {
    if (!night.night) continue;
    const date = night.night.date;
    const row = days.get(date) ?? {
      date,
      allotment: 0,
      booked: 0,
      held: 0,
      onSale: 0,
    };
    row.allotment += night.allotment?.tenths ?? 0;
    row.booked += night.booked?.tenths ?? 0;
    row.held += night.held?.tenths ?? 0;
    row.onSale += night.onSale?.tenths ?? 0;
    days.set(date, row);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function nextBusy(nights: HostNight[], from: string) {
  return aggregateDays(nights).find(
    (day) =>
      day.date >= from &&
      day.allotment > 0 &&
      (day.booked + day.held) * 100 >= day.allotment * 80,
  )?.date;
}

export function occupancyPercent(row: Occupancy) {
  const offered = row.allotment?.tenths ?? 0;
  return offered
    ? `${Math.round(((row.booked?.tenths ?? 0) * 100) / offered)}%`
    : "Not open";
}

export function sumPayouts(rows: Payout[]) {
  const sum = (
    field: "availableNow" | "heldForTraders" | "fees" | "sweptTotal",
  ) => rows.reduce((total, row) => total + (row[field]?.micros ?? 0n), 0n);
  return {
    availableNow: { micros: sum("availableNow") },
    heldForTraders: { micros: sum("heldForTraders") },
    fees: { micros: sum("fees") },
    sweptTotal: { micros: sum("sweptTotal") },
  };
}

export function formatInstant(at?: HostNight["releaseAt"]) {
  return at
    ? new Date(Number(at.seconds) * 1000 + at.nanos / 1000000).toLocaleString(
        "en-US",
        { timeZone: "UTC", timeZoneName: "short" },
      )
    : "Not scheduled";
}
