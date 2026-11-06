import type { MouseEvent } from "react";
import { formatRoomNights } from "../../../../shared/format";
import { isHoliday, shortNight } from "../../model/calendar";
import type { DaySummary, OpenState } from "../../model/day-summary";
import { premium } from "../../model/day-summary";
import { usd } from "../../model/money";
import { cx } from "../ui/cx";
import { StackBar } from "../ui/StackBar";
import styles from "./CalendarCell.module.css";

export type Pick = (date: string, event: MouseEvent) => void;

/** One night: guest price against usual rate, a stacked bar and what is left. */
export function CalendarCell({
  date,
  day,
  state,
  offTenths,
  isPast,
  isToday,
  isSelected,
  onPick,
}: {
  date: string;
  day?: DaySummary;
  state: OpenState;
  offTenths: number;
  isPast: boolean;
  isToday: boolean;
  isSelected: boolean;
  onPick: Pick;
}) {
  const holiday = isHoliday(date);
  const open = state !== "none" && day;
  const change = open ? premium(day.guestPrice, day.usualRate) : undefined;
  const usual = day?.usualRate ? `usual ${usd(day.usualRate)}` : "";
  const label = open
    ? `${shortNight(date)}. ${formatRoomNights(day.booked)} booked by guests, ${formatRoomNights(day.held)} held by traders, ${formatRoomNights(day.onSale)} still on sale.${state === "part" ? " Partly open." : ""}${day.guestPrice ? ` Selling at ${usd(day.guestPrice)}.` : ""}${isPast ? "" : " Opens the night analysis."}`
    : `${shortNight(date)}. Not open.${isPast ? "" : " Select to open."}`;
  return (
    <button
      type="button"
      className={cx(
        styles.hc,
        !open && styles.off,
        isPast && styles.past,
        isToday && styles.today,
        isSelected && styles.sel,
        open && day.onSale === 0 && styles.full,
      )}
      aria-pressed={isSelected}
      aria-disabled={isPast || undefined}
      aria-label={`${label}${holiday ? " Holiday." : ""}`}
      title={label}
      onClick={(event) => {
        if (!isPast) onPick(date, event);
      }}
    >
      <span className={styles.top}>
        <span className={styles.n}>{Number(date.slice(8))}</span>
        {holiday && <span className={styles.hol}>Holiday</span>}
      </span>
      {open ? (
        <>
          <span className={styles.mk}>
            {day.guestPrice ? (
              <>
                <b>{usd(day.guestPrice)}</b>
                {change !== undefined && (
                  <em className={cx(change >= 0 && styles.up)}>
                    {change >= 0 ? "+" : ""}
                    {change}%
                  </em>
                )}
              </>
            ) : (
              <b>Full</b>
            )}
          </span>
          <span className={styles.us}>{usual}</span>
          <span className={styles.bar}>
            <StackBar
              booked={day.booked}
              held={day.held}
              onSale={day.onSale}
              off={offTenths}
            />
          </span>
          <span className={styles.st}>
            {day.onSale === 0 || isPast
              ? `${formatRoomNights(day.booked)} booked`
              : `${formatRoomNights(day.onSale)} left`}
          </span>
        </>
      ) : (
        <>
          <span className={styles.mk}>Not open</span>
          <span className={styles.us}>{usual}</span>
        </>
      )}
    </button>
  );
}
