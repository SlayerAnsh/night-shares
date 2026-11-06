import type { HotelPricePoint } from "@night-shares/proto/host/v1/hotel_pb";
import { weekdayMon } from "./calendar";
import type { DaySummary } from "./day-summary";

export function roomTotals(days: DaySummary[]) {
  const total = { allotment: 0, booked: 0, held: 0, onSale: 0 };
  for (const day of days) {
    total.allotment += day.allotment;
    total.booked += day.booked;
    total.held += day.held;
    total.onSale += day.onSale;
  }
  return total;
}

/** Rooms booked or held as a share of rooms offered, Monday first. */
export function weekdayShares(days: DaySummary[]) {
  const sums = Array.from({ length: 7 }, () => ({ taken: 0, offered: 0 }));
  for (const day of days) {
    const slot = sums[weekdayMon(day.date)];
    if (!slot) continue;
    slot.taken += day.booked + day.held;
    slot.offered += day.allotment;
  }
  return sums.map((s) => (s.offered ? s.taken / s.offered : 0));
}

export type PricePoint = { date: string; usual: number; price?: number };

export function pricePoints(series: HotelPricePoint[]): PricePoint[] {
  return series.map((point) => ({
    date: point.date,
    usual: Number(point.usualRate?.micros ?? 0n) / 1e6,
    price: point.guestPrice?.micros
      ? Number(point.guestPrice.micros) / 1e6
      : undefined,
  }));
}

export function priceInsight(points: PricePoint[]) {
  const priced = points.filter((p) => p.price !== undefined);
  if (!priced.length) return "No rooms on sale in this window.";
  const above = priced.filter((p) => (p.price ?? 0) > p.usual).length;
  return `Guest price is above your usual rate on ${above} of ${priced.length} nights on sale.`;
}
