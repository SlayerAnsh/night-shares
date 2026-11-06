import { cx } from "@night-shares/design-system";
import styles from "./Charts.module.css";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Share of offered rooms booked or held, one bar per weekday, busiest in full colour. */
export function Weekdays({ shares }: { shares: number[] }) {
  const max = Math.max(...shares, 0.01);
  const top = shares.indexOf(Math.max(...shares));
  return (
    <div className={styles.wdChart}>
      {shares.map((share, i) => (
        <div key={DOW[i]} className={cx(styles.wd, i === top && styles.top)}>
          <span className={styles.wdV}>{Math.round(share * 100)}%</span>
          <span className={styles.wdBar}>
            <i style={{ height: `${((share / max) * 100).toFixed(1)}%` }} />
          </span>
          <span className={styles.wdL}>{DOW[i]}</span>
        </div>
      ))}
    </div>
  );
}

export const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
