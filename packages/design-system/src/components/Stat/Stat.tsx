import type { ReactNode } from "react";
import { cx } from "../cx";
import styles from "./Stat.module.css";

export type StatProps = {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  size?: "sm" | "md";
  // Light text for use inside an inverse Card.
  inverse?: boolean;
  className?: string;
};

export function Stat({
  label,
  value,
  detail,
  size = "md",
  inverse = false,
  className,
}: StatProps) {
  return (
    <div
      className={cx(
        styles.stat,
        size === "sm" && styles.sm,
        inverse && styles.inverse,
        className,
      )}
    >
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{value}</div>
      {detail && <div className={styles.detail}>{detail}</div>}
    </div>
  );
}
