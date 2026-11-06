import type { HTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./Card.module.css";

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "article" | "aside";
  // Default inner padding (20px 24px). Leave off to lay out the inside yourself.
  padded?: boolean;
  // Ink background, used for the one highlighted tile in a row.
  inverse?: boolean;
};

export function Card({
  as: Tag = "div",
  padded = false,
  inverse = false,
  className,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={cx(
        styles.card,
        padded && styles.pad,
        inverse && styles.inverse,
        className,
      )}
      {...rest}
    />
  );
}
