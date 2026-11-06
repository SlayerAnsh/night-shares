import type { HostNight } from "@night-shares/proto/host/v1/hotel_pb";

export type DaySummary = {
  date: string;
  /** Room types with rooms offered that night. */
  openTypes: number;
  allotment: number;
  booked: number;
  held: number;
  onSale: number;
  /** Guest price of the first filtered room type still on sale. */
  guestPrice?: bigint;
  usualRate?: bigint;
};

/** One summary per date over the given room types, in tenths of a room night. */
export function summarizeDays(nights: HostNight[], roomTypeIds: string[]) {
  const days = new Map<string, DaySummary>();
  for (const row of nights) {
    if (!row.night || !roomTypeIds.includes(row.night.roomTypeId)) continue;
    const date = row.night.date;
    const day = days.get(date) ?? {
      date,
      openTypes: 0,
      allotment: 0,
      booked: 0,
      held: 0,
      onSale: 0,
    };
    const allotment = row.allotment?.tenths ?? 0;
    const onSale = row.onSale?.tenths ?? 0;
    if (allotment > 0) day.openTypes += 1;
    day.allotment += allotment;
    day.booked += row.booked?.tenths ?? 0;
    day.held += row.held?.tenths ?? 0;
    day.onSale += onSale;
    day.usualRate ??= row.usualRate?.micros;
    if (onSale > 0 && day.guestPrice === undefined && row.guestPrice?.micros)
      day.guestPrice = row.guestPrice.micros;
    days.set(date, day);
  }
  return days;
}

export type OpenState = "none" | "part" | "all";

export function openState(day: DaySummary | undefined, typeCount: number) {
  if (!day || day.openTypes === 0) return "none";
  return day.openTypes < typeCount ? "part" : "all";
}

/** Percent change of the guest price against the usual rate, rounded. */
export function premium(price?: bigint, usual?: bigint) {
  if (!price || !usual) return undefined;
  return Math.round((Number(price) / Number(usual) - 1) * 100);
}
