import type { ReactNode } from "react";
import { cx } from "./cx";
import styles from "./SyncPill.module.css";

/** Status pill with a live dot, for "connected" and "paid out automatically". */
export function SyncPill({
  children,
  off,
  small,
}: {
  children: ReactNode;
  off?: boolean;
  small?: boolean;
}) {
  return (
    <span className={cx(styles.sync, off && styles.off, small && styles.small)}>
      <span className={styles.dot} />
      {children}
    </span>
  );
}
