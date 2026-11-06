"use client";
import { useEffect, useState } from "react";
import { type NightRange, pickNight } from "../../../model/calendar";
import {
  formatShort,
  localToday,
  monthStart,
  nightsBetween,
  plural,
} from "../../../model/dates";
import { Icon } from "../Icon";
import { CalendarMonth } from "./CalendarMonth";
import styles from "./RangeCalendar.module.css";

export type NightLabel = { text: string; tier: "lo" | "mid" | "hi" };

// Two month range picker from the mock (NS.rangeCal). It reports a stay only
// once both nights are picked, so the URL never holds half a range.
export function RangeCalendar({
  value,
  onChange,
  onDone,
  onView,
  label,
  months = 2,
}: {
  value: NightRange;
  onChange: (range: NightRange) => void;
  onDone?: () => void;
  onView?: (first: string, months: number) => void;
  label?: (date: string) => NightLabel | undefined;
  months?: number;
}) {
  const today = localToday();
  const [draft, setDraft] = useState(value);
  const [view, setView] = useState(monthStart(value.checkIn || today));
  const [hover, setHover] = useState("");
  const { checkIn, checkOut } = value;
  useEffect(() => setDraft({ checkIn, checkOut }), [checkIn, checkOut]);
  useEffect(() => onView?.(view, months), [onView, view, months]);
  const range = draft;
  const nights =
    range.checkIn && range.checkOut
      ? nightsBetween(range.checkIn, range.checkOut)
      : 0;
  function pick(date: string) {
    const next = pickNight(range, date);
    setDraft(next);
    setHover("");
    if (next.checkOut) onChange(next);
  }
  function clear() {
    setDraft({ checkIn: "", checkOut: "" });
    onChange({ checkIn: "", checkOut: "" });
  }
  return (
    <div className={styles.cal}>
      <div className={styles.head}>
        <button
          type="button"
          className={styles.nav}
          disabled={view <= monthStart(today)}
          aria-label="Previous month"
          onClick={() => setView(monthStart(view, -1))}
        >
          <Icon name="left" />
        </button>
        <button
          type="button"
          className={styles.nav}
          aria-label="Next month"
          onClick={() => setView(monthStart(view, 1))}
        >
          <Icon name="right" />
        </button>
      </div>
      <div className={styles.months} data-months={months}>
        {Array.from({ length: months }, (_, i) => monthStart(view, i)).map(
          (first) => (
            <CalendarMonth
              key={first}
              first={first}
              today={today}
              range={range}
              hover={hover}
              label={label}
              onPick={pick}
              onHover={setHover}
            />
          ),
        )}
      </div>
      <div className={styles.foot}>
        <span role="status">
          {range.checkIn ? (
            nights ? (
              <>
                <b>{plural(nights, "night")}</b> · {formatShort(range.checkIn)}{" "}
                → {formatShort(range.checkOut)}
              </>
            ) : (
              `Check-in ${formatShort(range.checkIn)} · pick check-out`
            )
          ) : label ? (
            <>
              <span className={styles.legendLo}>Green</span> = lower than usual
            </>
          ) : (
            "Pick your check-in date"
          )}
        </span>
        <span className={styles.actions}>
          <button type="button" className={styles.link} onClick={clear}>
            Clear
          </button>
          {onDone && (
            <button type="button" className={styles.done} onClick={onDone}>
              Done
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
