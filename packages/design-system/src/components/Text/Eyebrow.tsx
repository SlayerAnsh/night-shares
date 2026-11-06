import type { HTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./Text.module.css";

export type EyebrowProps = HTMLAttributes<HTMLElement> & {
  as?: "span" | "p" | "h2" | "h3" | "div";
};

// Small uppercase label above a heading or section.
export function Eyebrow({
  as: Tag = "span",
  className,
  ...rest
}: EyebrowProps) {
  return <Tag className={cx(styles.eyebrow, className)} {...rest} />;
}
