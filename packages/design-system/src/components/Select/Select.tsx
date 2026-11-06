import type { SelectHTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./Select.module.css";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

// A native select with the mock look. Pass <option> children.
export function Select({ className, ...rest }: SelectProps) {
  return <select className={cx(styles.select, className)} {...rest} />;
}
