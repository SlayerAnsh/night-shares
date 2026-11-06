import type { HTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./Pill.module.css";

export type PillProps = HTMLAttributes<HTMLSpanElement> & {
  // A green live dot before the text.
  dot?: boolean;
};

export function Pill({ dot = false, className, children, ...rest }: PillProps) {
  return (
    <span className={cx(styles.pill, className)} {...rest}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}
