import type { HTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./Badge.module.css";

export type BadgeTone = "soft" | "pos" | "neg" | "warn" | "accent";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({ tone = "soft", className, ...rest }: BadgeProps) {
  return (
    <span className={cx(styles.badge, styles[tone], className)} {...rest} />
  );
}
