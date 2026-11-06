import { cx } from "./cx";
import styles from "./StackBar.module.css";

export type Fill = "b" | "h" | "s" | "o";

/** Booked, held and on sale as one bar. `off` is room types not open, drawn as a dashed end. */
export function StackBar({
  booked,
  held,
  onSale,
  off = 0,
  big,
}: {
  booked: number;
  held: number;
  onSale: number;
  off?: number;
  big?: boolean;
}) {
  const total = booked + held + onSale + off;
  if (!total) return null;
  const w = (x: number) => `${((x / total) * 100).toFixed(1)}%`;
  return (
    <span className={cx(styles.bar, big && styles.big)} aria-hidden="true">
      <i className={styles.b} style={{ width: w(booked) }} />
      <i className={styles.h} style={{ width: w(held) }} />
      <i className={styles.s} style={{ width: w(onSale) }} />
      {off > 0 && <i className={styles.o} style={{ width: w(off) }} />}
    </span>
  );
}

export function Swatch({ fill }: { fill: Fill | "off" | "part" }) {
  const cls =
    fill === "off"
      ? styles.keyOff
      : fill === "part"
        ? styles.keyPart
        : styles[fill];
  return <i className={cx(styles.key, cls)} aria-hidden="true" />;
}
