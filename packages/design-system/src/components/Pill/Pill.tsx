import type { HTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./Pill.module.css";

export type PillProps = HTMLAttributes<HTMLSpanElement> & {
  // A status dot before the text: green when live, grey when "off".
  dot?: boolean | "off";
  size?: "md" | "sm";
};

export function Pill({
  dot = false,
  size = "md",
  className,
  children,
  ...rest
}: PillProps) {
  return (
    <span
      className={cx(
        styles.pill,
        dot && styles.status,
        size === "sm" && styles.sm,
        className,
      )}
      {...rest}
    >
      {dot && (
        <span
          className={cx(styles.dot, dot === "off" && styles.off)}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
