"use client";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { useRef } from "react";
import {
  addDays,
  isWeekendNight,
  monthDates,
  rangeDates,
} from "../model/calendar";
import { type DaySummary, openState } from "../model/day-summary";
import type { useOpening } from "./use-opening";

type Quick = "next7" | "weekends" | "off" | "clear";

/**
 * Calendar gestures. A plain click on an open night opens its analysis.
 * A click on a night that is not open, cmd or ctrl click, or shift click
 * builds the selection the open nights form works on.
 */
export function useCalendarPick({
  propertyId,
  opening: o,
  days,
  typeCount,
  month,
  today,
}: {
  propertyId: string;
  opening: ReturnType<typeof useOpening>;
  days: Map<string, DaySummary>;
  typeCount: number;
  month: string;
  today: string;
}) {
  const router = useRouter();
  const anchor = useRef<string | null>(null);
  const pickDates = (dates: string[]) =>
    o.set({
      mode: "picked",
      from: "",
      to: "",
      dates: [...new Set(dates)]
        .filter((d) => d >= today)
        .sort()
        .join(","),
    });
  const future = monthDates(month).filter((d) => d >= today);
  const notFullyOpen = () =>
    future.filter((d) => openState(days.get(d), typeCount) !== "all");

  function onPick(date: string, event: MouseEvent) {
    const from = anchor.current;
    anchor.current = date;
    if (event.shiftKey && from)
      return pickDates([...o.dates, ...rangeDates(from, date)]);
    if (event.metaKey || event.ctrlKey) return o.toggleDate(date);
    if (openState(days.get(date), typeCount) !== "none")
      return router.push(`/host/${propertyId}/${date}`);
    o.toggleDate(date);
  }

  function onQuick(pick: Quick) {
    if (pick === "clear") return clear();
    if (pick === "next7")
      return o.set({
        mode: "range",
        from: today,
        to: addDays(today, 7),
        dates: "",
      });
    if (pick === "weekends") return pickDates(future.filter(isWeekendNight));
    pickDates(
      future.filter((d) => openState(days.get(d), typeCount) === "none"),
    );
  }

  function clear() {
    anchor.current = null;
    o.set({ mode: "", from: "", to: "", dates: "" });
  }

  /** Header button: every night left this month that is not fully open, else the next week. */
  function openMonth() {
    const dates = notFullyOpen();
    if (dates.length) return pickDates(dates);
    onQuick("next7");
  }

  return { onPick, onQuick, clear, openMonth };
}
