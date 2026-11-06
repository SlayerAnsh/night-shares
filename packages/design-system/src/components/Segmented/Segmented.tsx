import type { ReactNode } from "react";
import { cx } from "../cx";
import styles from "./Segmented.module.css";

export type SegmentedOption<T extends string> = { value: T; label: ReactNode };

export type SegmentedProps<T extends string> = {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  // Names the group for screen readers.
  label: string;
  // Stretch to the container width with equal segments.
  block?: boolean;
  className?: string;
};

// A small set of mutually exclusive choices, for example Buy or Sell.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  block = false,
  className,
}: SegmentedProps<T>) {
  return (
    <fieldset
      className={cx(styles.seg, block && styles.block, className)}
      aria-label={label}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.option}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}
