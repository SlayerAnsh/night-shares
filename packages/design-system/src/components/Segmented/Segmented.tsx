import type { ReactNode } from "react";
import { cx } from "../cx";
import styles from "./Segmented.module.css";

type Value = string | number;

export type SegmentedOption<T extends Value> = { value: T; label: ReactNode };

export type SegmentedProps<T extends Value> = {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  // Names the group for screen readers.
  label: string;
  // Stretch to the container width with equal segments.
  block?: boolean;
  // md is the mock .seg; trade uses sm for chips (30px) and xs for time frames (26px).
  size?: "md" | "sm" | "xs";
  className?: string;
};

// A small set of mutually exclusive choices, for example Buy or Sell.
export function Segmented<T extends Value>({
  options,
  value,
  onChange,
  label,
  block = false,
  size = "md",
  className,
}: SegmentedProps<T>) {
  return (
    <fieldset
      className={cx(
        styles.seg,
        block && styles.block,
        size !== "md" && styles[size],
        className,
      )}
      aria-label={label}
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
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
