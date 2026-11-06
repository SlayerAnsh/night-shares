import { Segmented as DsSegmented } from "@night-shares/design-system";
import styles from "./segmented.module.css";

export type SegmentedOption<T extends string> = { value: T; label: string };

// Design system Segmented in the three trade sizes: city chips (chip-x),
// small time frame toggles (tf) and the full width Buy | Sell (tk-tabs).
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  variant = "chips",
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  variant?: "chips" | "small" | "wide";
}) {
  return (
    <DsSegmented
      options={options}
      value={value}
      onChange={onChange}
      label={label}
      block={variant === "wide"}
      className={`${styles.group} ${styles[variant]}`}
    />
  );
}
