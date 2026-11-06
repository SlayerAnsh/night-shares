import { cx } from "../cx";
import styles from "./Spinner.module.css";

export type SpinnerProps = {
  size?: "sm" | "lg";
  // Announced to screen readers.
  label?: string;
  className?: string;
};

export function Spinner({
  size = "sm",
  label = "Loading",
  className,
}: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cx(styles.spin, size === "lg" && styles.lg, className)}
    />
  );
}
