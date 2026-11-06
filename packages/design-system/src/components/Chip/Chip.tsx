import type { ButtonHTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./Chip.module.css";

export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  // Selected state, exposed as aria-pressed.
  on?: boolean;
};

// A filter toggle. Group several in a flex row.
export function Chip({
  on = false,
  className,
  type = "button",
  ...rest
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={on}
      className={cx(styles.chip, className)}
      {...rest}
    />
  );
}
