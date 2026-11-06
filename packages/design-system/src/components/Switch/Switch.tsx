import type { ButtonHTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./Switch.module.css";

export type SwitchProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange"
> & {
  checked: boolean;
  onChange: (checked: boolean) => void;
  // Accessible name when no visible label points at the switch.
  label?: string;
};

export function Switch({
  checked,
  onChange,
  label,
  className,
  ...rest
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={cx(styles.switch, className)}
      onClick={() => onChange(!checked)}
      {...rest}
    />
  );
}
