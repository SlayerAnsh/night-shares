import type { NightRange } from "../../../model/calendar";
import { formatMonth, monthCells } from "../../../model/dates";
import type { NightLabel } from "./RangeCalendar";
import styles from "./RangeCalendar.module.css";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

export function CalendarMonth({
  first,
  today,
  range,
  hover,
  label,
  onPick,
  onHover,
}: {
  first: string;
  today: string;
  range: NightRange;
  hover: string;
  label?: (date: string) => NightLabel | undefined;
  onPick: (date: string) => void;
  onHover: (date: string) => void;
}) {
  const end =
    range.checkOut || (range.checkIn && hover > range.checkIn ? hover : "");
  return (
    <div className={styles.month}>
      <div className={styles.title}>{formatMonth(first)}</div>
      <div className={styles.grid}>
        {DOW.map((d, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: weekday letters repeat
          <div key={i} className={styles.dow} aria-hidden="true">
            {d}
          </div>
        ))}
        {monthCells(first).map((date, i) => {
          // biome-ignore lint/suspicious/noArrayIndexKey: padding cells have no date
          if (!date) return <div key={`pad${i}`} />;
          const past = date < today;
          const isStart = date === range.checkIn;
          const isEnd = !!range.checkOut && date === range.checkOut;
          const inside =
            !!range.checkIn && !!end && date > range.checkIn && date < end;
          const night = past ? undefined : label?.(date);
          const classes = [
            styles.day,
            date === today && styles.today,
            inside && styles.in,
            isStart && styles.start,
            isStart && range.checkOut && styles.hasEnd,
            isEnd && styles.end,
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={date}
              type="button"
              className={classes}
              disabled={past}
              aria-pressed={isStart || isEnd}
              aria-label={date}
              onClick={() => onPick(date)}
              onMouseEnter={() => onHover(date)}
              onFocus={() => onHover(date)}
            >
              <span>{Number(date.slice(8))}</span>
              {night && <em className={styles[night.tier]}>{night.text}</em>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
