"use client";
import { useHotel } from "../../hooks/use-host-data";
import { addDays, shiftMonth, shortNight } from "../../model/calendar";
import { summarizeDays } from "../../model/day-summary";
import styles from "./DayStrip.module.css";

/** One bar per night for the next 30 nights: booked, held, on sale. */
export function DayStrip({
  propertyId,
  roomTypeIds,
  from,
}: {
  propertyId: string;
  roomTypeIds: string[];
  from: string;
}) {
  const month = from.slice(0, 7);
  const first = useHotel(propertyId, month);
  const second = useHotel(propertyId, shiftMonth(month, 1));
  const nights = [
    ...(first.data?.calendar ?? []),
    ...(second.data?.calendar ?? []),
  ];
  const days = summarizeDays(nights, roomTypeIds);
  const dates = Array.from({ length: 30 }, (_, i) => addDays(from, i));
  const max = Math.max(1, ...dates.map((d) => days.get(d)?.allotment ?? 0));
  const h = (x: number) => `${((x / max) * 100).toFixed(1)}%`;
  return (
    <div className={styles.days} aria-hidden="true">
      {dates.map((date) => {
        const day = days.get(date);
        return (
          <span key={date} title={shortNight(date)}>
            {day && (
              <>
                <i className={styles.s} style={{ height: h(day.onSale) }} />
                <i className={styles.h} style={{ height: h(day.held) }} />
                <i className={styles.b} style={{ height: h(day.booked) }} />
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}
