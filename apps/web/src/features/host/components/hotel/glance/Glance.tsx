import { cx } from "@night-shares/design-system";
import type { HotelPricePoint } from "@night-shares/proto/host/v1/hotel_pb";
import type { ReactNode } from "react";
import { formatRoomNights } from "../../../../../shared/format";
import { monthName } from "../../../model/calendar";
import type { DaySummary } from "../../../model/day-summary";
import {
  priceInsight,
  pricePoints,
  roomTotals,
  weekdayShares,
} from "../../../model/glance";
import ui from "../../ui/ui.module.css";
import { Donut } from "./Donut";
import styles from "./Glance.module.css";
import { PriceLine } from "./PriceLine";
import { WEEKDAY_NAMES, Weekdays } from "./Weekdays";

function Tile({
  title,
  insight,
  wide,
  children,
  keyRow,
}: {
  title: string;
  insight: string;
  wide?: boolean;
  children: ReactNode;
  keyRow?: ReactNode;
}) {
  return (
    <article className={cx(ui.card, styles.gl, wide && styles.wide)}>
      <h3>{title}</h3>
      <p className={styles.ins}>{insight}</p>
      {children}
      {keyRow && <div className={styles.key}>{keyRow}</div>}
    </article>
  );
}

/** Analysis tiles for one hotel: the month's rooms, busiest weekdays and guest price. */
export function Glance({
  month,
  days,
  series,
  scope,
}: {
  month: string;
  days: DaySummary[];
  series: HotelPricePoint[];
  scope: string;
}) {
  const total = roomTotals(days);
  const shares = weekdayShares(days);
  const top = shares.indexOf(Math.max(...shares));
  const points = pricePoints(series);
  const taken = total.booked + total.held;
  return (
    <section aria-labelledby="glance-h">
      <h2 id="glance-h" className={ui.srOnly}>
        At a glance
      </h2>
      <div className={styles.grid}>
        <Tile
          title={`Where your rooms are, ${monthName(month)}`}
          insight={
            total.allotment
              ? `${formatRoomNights(taken)} of ${formatRoomNights(total.allotment)} offered room nights are booked or held by traders, ${formatRoomNights(total.onSale)} still on sale.`
              : "No nights open this month yet."
          }
        >
          <Donut total={total} />
        </Tile>
        <Tile
          title="Busiest nights of the week"
          insight={
            total.allotment
              ? `${WEEKDAY_NAMES[top]} is your busiest night, ${Math.round((shares[top] ?? 0) * 100)}% of offered rooms taken.`
              : "Open nights to see which weekdays fill first."
          }
          keyRow={
            <span>
              Rooms booked or held, as a percent of rooms offered,{" "}
              {monthName(month)}
            </span>
          }
        >
          <Weekdays shares={shares} />
        </Tile>
        <Tile
          wide
          title="Guest price against your usual rate"
          insight={priceInsight(points)}
          keyRow={
            <>
              <span>
                <i className={styles.ln} />
                Guest price
              </span>
              <span>
                <i className={cx(styles.ln, styles.lnUsual)} />
                Usual rate
              </span>
              <span>
                <i className={styles.ar} />
                Above usual rate
              </span>
              <span>All room types, next {points.length} nights</span>
            </>
          }
        >
          <PriceLine
            points={points}
            label={`Guest price over the next ${points.length} nights against your usual rate. ${priceInsight(points)}`}
          />
        </Tile>
      </div>
      <p className={ui.srOnly}>Showing {scope}.</p>
    </section>
  );
}
