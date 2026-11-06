import { cx } from "./cx";
import styles from "./Seg.module.css";
import ui from "./ui.module.css";

/** Segmented control: one pressed button per group. */
export function Seg<T extends string | number>({
  label,
  options,
  value,
  onChange,
  full,
  disabled,
}: {
  label: string;
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (value: T) => void;
  full?: boolean;
  disabled?: boolean;
}) {
  return (
    <fieldset className={cx(styles.seg, full && styles.full)}>
      <legend className={ui.srOnly}>{label}</legend>
      {options.map(([v, text]) => (
        <button
          key={String(v)}
          type="button"
          className={cx(v === value && styles.on)}
          aria-pressed={v === value}
          disabled={disabled}
          onClick={() => onChange(v)}
        >
          {text}
        </button>
      ))}
    </fieldset>
  );
}
