import { cx, Photo } from "@night-shares/design-system";
import type { CSSProperties } from "react";
import styles from "./Viz.module.css";

const width = (percent: number) => ({ "--w": `${percent}%` }) as CSSProperties;

export function PhotoViz() {
  return (
    <div className={styles.viz}>
      <Photo
        className={styles.photo}
        tone={["#8EA86B", "#2F4A2B"]}
        src="https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=900&q=72"
      />
    </div>
  );
}

// Four weeks of a host calendar: booked share as a bar, three selected nights, a few closed.
const days = Array.from({ length: 28 }, (_, i) => ({
  isOff: i > 23 || i === 4 || i === 18,
  isSel: i >= 11 && i <= 13,
  fill: 30 + ((i * 37) % 70),
}));

export function CalendarViz() {
  return (
    <div className={cx(styles.viz, styles.cal)} aria-hidden="true">
      {days.map((day, i) => (
        <i
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed decorative grid.
          key={i}
          className={cx(
            styles.day,
            day.isOff && styles.off,
            day.isSel && styles.sel,
          )}
          style={width(day.isOff ? 0 : day.fill)}
        />
      ))}
    </div>
  );
}

// A static order book: five asks over the mid price, five bids under it.
const asks = [
  [832, 7, 64],
  [828, 3, 38],
  [824, 9, 82],
  [820, 2, 27],
  [816, 5, 51],
] as const;
const bids = [
  [808, 4, 44],
  [804, 8, 76],
  [800, 6, 58],
  [796, 1, 22],
  [792, 9, 88],
] as const;

export function BookViz() {
  const row = (side: string, [price, size, depth]: readonly number[]) => (
    <div
      key={price}
      className={cx(styles.level, side)}
      style={width(depth ?? 0)}
    >
      <span>{price?.toFixed(2)}</span>
      <span>{size}</span>
    </div>
  );
  return (
    <div className={cx(styles.viz, styles.book)} aria-hidden="true">
      {asks.map((level) => row(styles.ask ?? "", level))}
      <div className={cx(styles.level, styles.mid)}>
        <span>812.00</span>
        <span>+2.4%</span>
      </div>
      {bids.map((level) => row(styles.bid ?? "", level))}
    </div>
  );
}
