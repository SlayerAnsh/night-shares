import { buttonClass } from "@night-shares/design-system";
import {
  addDays,
  monthDates,
  monthName,
  weekdayMon,
} from "../../model/calendar";
import { type DaySummary, openState } from "../../model/day-summary";
import { cx } from "../ui/cx";
import { Icon } from "../ui/Icon";
import { Swatch } from "../ui/StackBar";
import ui from "../ui/ui.module.css";
import styles from "./Calendar.module.css";
import { CalendarCell, type Pick } from "./CalendarCell";

export type QuickPick = "next7" | "weekends" | "off" | "clear";

const QUICK: [QuickPick, string][] = [
  ["next7", "Next 7 days"],
  ["weekends", "Weekends"],
  ["off", "Not open"],
  ["clear", "Clear"],
];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function HotelCalendar({
  month,
  today,
  days,
  typeCount,
  selected,
  onPick,
  onMonth,
  onQuick,
}: {
  month: string;
  today: string;
  days: Map<string, DaySummary>;
  typeCount: number;
  selected: string[];
  onPick: Pick;
  onMonth: (step: -1 | 0 | 1) => void;
  onQuick: (pick: QuickPick) => void;
}) {
  const dates = monthDates(month);
  const first = dates[0] ?? `${month}-01`;
  const lead = weekdayMon(first);
  const blanks = Array.from({ length: lead }, (_, i) =>
    addDays(first, i - lead),
  );
  return (
    <section className={cx(ui.card, styles.card)} aria-label="Night calendar">
      <div className={styles.nav}>
        <button
          type="button"
          className={ui.ib}
          aria-label="Previous month"
          onClick={() => onMonth(-1)}
        >
          <Icon name="left" />
        </button>
        <h2 aria-live="polite">{monthName(month)}</h2>
        <button
          type="button"
          className={ui.ib}
          aria-label="Next month"
          onClick={() => onMonth(1)}
        >
          <Icon name="right" />
        </button>
        <button
          type="button"
          className={cx(buttonClass({ size: "sm" }), styles.today)}
          onClick={() => onMonth(0)}
        >
          Today
        </button>
      </div>
      <div className={styles.quick}>
        Select
        {QUICK.map(([pick, label]) => (
          <button key={pick} type="button" onClick={() => onQuick(pick)}>
            {label}
          </button>
        ))}
      </div>
      <div className={styles.grid}>
        {DOW.map((d) => (
          <div key={d} className={styles.dow}>
            {d}
          </div>
        ))}
        {blanks.map((blank) => (
          <div key={blank} aria-hidden="true" />
        ))}
        {dates.map((date) => {
          const day = days.get(date);
          const state = openState(day, typeCount);
          const perType = day?.openTypes ? day.allotment / day.openTypes : 0;
          return (
            <CalendarCell
              key={date}
              date={date}
              day={day}
              state={state}
              offTenths={
                state === "part"
                  ? perType * (typeCount - (day?.openTypes ?? 0))
                  : 0
              }
              isPast={date < today}
              isToday={date === today}
              isSelected={selected.includes(date)}
              onPick={onPick}
            />
          );
        })}
      </div>
      <div className={styles.legend}>
        <span>
          <Swatch fill="b" />
          Booked by guests
        </span>
        <span>
          <Swatch fill="h" />
          Held by traders
        </span>
        <span>
          <Swatch fill="s" />
          Still on sale
        </span>
        <span>
          <Swatch fill="off" />
          Not open
        </span>
        <span>
          <Swatch fill="part" />
          Partly open
        </span>
        <span className={styles.tip}>
          Click an open night to see its analysis. Click a night that is not
          open, or shift click a range, to pick nights to open.
        </span>
      </div>
    </section>
  );
}
