import type { ReactNode } from "react";
import { cx } from "../cx";
import styles from "./Field.module.css";

export type FieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  // The control: Input, Select or any native form element.
  children: ReactNode;
};

// A label wrapping its control, so no id wiring is needed.
export function Field({ label, hint, error, className, children }: FieldProps) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control arrives as children.
    <label className={cx(styles.field, className)}>
      <span className={styles.label}>{label}</span>
      {children}
      {hint && <span className={styles.hint}>{hint}</span>}
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
