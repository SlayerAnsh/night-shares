import type { InputHTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./Input.module.css";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  // Monospace tabular digits, for amounts and addresses.
  mono?: boolean;
};

export function Input({ mono = false, className, ...rest }: InputProps) {
  return (
    <input
      className={cx(styles.input, mono && styles.mono, className)}
      {...rest}
    />
  );
}
