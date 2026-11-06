import type { ButtonHTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./IconButton.module.css";

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  // Accessible name, since the button shows only an icon.
  label: string;
};

export function IconButton({
  label,
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(styles.ib, className)}
      {...rest}
    />
  );
}
