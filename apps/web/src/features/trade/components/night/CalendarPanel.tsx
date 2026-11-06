import { EmptyState } from "@night-shares/design-system";
import type { NightKey } from "@night-shares/proto/common/v1/night_pb";
import type { NightCard } from "@night-shares/proto/market/v1/analytics_pb";
import type { GetNightResponse } from "@night-shares/proto/market/v1/market_pb";
import Link from "next/link";
import { fairDelta, fairText, fairTone } from "../../model/display";
import { nightHref } from "../../model/market";
import { Skeleton } from "../ui/Skeleton";
import text from "../ui/text.module.css";
import styles from "./calendar.module.css";
import { OtherMarkets } from "./OtherMarkets";
import tabs from "./tabs.module.css";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function shortPrice(micros?: bigint) {
  if (micros === undefined) return "n/a";
  const n = Number(micros) / 1e6;
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
}

// Each date is its own market: one month grid for this room type.
export function CalendarPanel({
  night,
  detail,
}: {
  night: Pick<NightKey, "propertyId" | "roomTypeId" | "date">;
  detail?: GetNightResponse;
}) {
  if (!detail) return <Skeleton rows={5} label="Loading other dates" />;
  const byDate = new Map<string, NightCard>();
  for (const card of detail.monthCalendar)
    if (card.night?.roomTypeId === night.roomTypeId)
      byDate.set(card.night.date, card);
  const first = new Date(`${night.date.slice(0, 7)}-01T00:00:00Z`);
  const days = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const iso = (day: number) =>
    `${night.date.slice(0, 7)}-${String(day).padStart(2, "0")}`;
  return (
    <>
      <p className={tabs.line}>
        Each date is a separate market. Price and ask vs fair per night.
      </p>
      <div className={styles.head}>
        <b>{MONTH.format(first)}</b>
      </div>
      {byDate.size ? (
        <div className={styles.grid}>
          {DOW.map((d) => (
            <div key={d} className={styles.dow}>
              {d}
            </div>
          ))}
          {DOW.slice(0, first.getUTCDay()).map((d) => (
            <div key={`blank-${d}`} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const date = iso(i + 1);
            const card = byDate.get(date);
            if (!card?.night)
              return (
                <div key={date} className={`${styles.cell} ${styles.off}`}>
                  <span>{i + 1}</span>
                </div>
              );
            const delta = fairDelta(card.price?.micros, card.fairPrice?.micros);
            const on = date === night.date;
            return (
              <Link
                key={date}
                href={nightHref(card.night)}
                aria-current={on ? "page" : undefined}
                className={`${styles.cell} ${on ? styles.on : ""}`}
              >
                <span>{i + 1}</span>
                <b className={text.num}>{shortPrice(card.price?.micros)}</b>
                <small className={text[fairTone(delta)]}>
                  {fairText(delta)}
                </small>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState plain>No other dates are trading this month.</EmptyState>
      )}
      <p className={styles.legend}>
        <span>First line: price per room night</span>
        <span>
          Second line: ask vs fair price,{" "}
          <b className={text.pos}>green below</b> and{" "}
          <b className={text.neg}>red above</b>
        </span>
      </p>
      <OtherMarkets night={night} cards={detail.monthCalendar} />
    </>
  );
}
