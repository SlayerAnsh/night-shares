import type { HTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./Text.module.css";

export type DisplayProps = HTMLAttributes<HTMLHeadingElement> & {
  as?: "h1" | "h2" | "h3" | "p" | "span";
};

// Bebas Neue headline type. Set font-size from the caller.
export function Display({ as: Tag = "h2", className, ...rest }: DisplayProps) {
  return <Tag className={cx(styles.display, className)} {...rest} />;
}
