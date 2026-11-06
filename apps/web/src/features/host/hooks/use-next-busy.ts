"use client";
import { nextBusy } from "../model/host-view";
import { useHotel } from "./use-host-data";

export function useNextBusy(propertyId: string, from: string, month: string) {
  const query = useHotel(propertyId, month);
  const end = new Date(`${from}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 120);
  const until = Number.isFinite(end.getTime())
    ? end.toISOString().slice(0, 10)
    : "";
  const busy = nextBusy(
    (query.data?.calendar ?? []).filter(
      (row) => (row.night?.date ?? "") < until,
    ),
    from,
  );
  const next = new Date(`${month}-01T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const nextMonth = Number.isFinite(next.getTime())
    ? next.toISOString().slice(0, 7)
    : "";
  return {
    query,
    busy,
    nextMonth,
    hasMore: !!nextMonth && `${nextMonth}-01` < until,
  };
}
