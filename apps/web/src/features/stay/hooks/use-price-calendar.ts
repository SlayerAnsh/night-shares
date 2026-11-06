"use client";
import { useQuery } from "@connectrpc/connect-query";
import { getPriceCalendar } from "@night-shares/proto/stay/v1/stay-StayService_connectquery";
import { useCallback, useState } from "react";
import { localToday, monthStart } from "../model/dates";

// Nightly prices for the months the calendar shows, from today on.
export function usePriceCalendar(propertyId: string, roomTypeId: string) {
  const [view, setView] = useState({ first: "", months: 2 });
  const today = localToday();
  const startDate = view.first.localeCompare(today) > 0 ? view.first : today;
  const endDate = view.first ? monthStart(view.first, view.months) : "";
  const calendar = useQuery(
    getPriceCalendar,
    { propertyId, roomTypeId, startDate, endDate },
    {
      enabled: !!roomTypeId && !!endDate && endDate > startDate,
      staleTime: 60_000,
    },
  );
  const onView = useCallback(
    (first: string, months: number) => setView({ first, months }),
    [],
  );
  return { calendar, onView };
}
