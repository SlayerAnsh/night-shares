import { cx } from "../cx";
import styles from "./Stepper.module.css";

export type StepperProps = {
  value: number;
  onChange: (value: number) => void;
  // Names the control for screen readers, for example "Guests".
  label: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
};

// The mock's minus, count, plus control.
export function Stepper({
  value,
  onChange,
  label,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  disabled = false,
  className,
}: StepperProps) {
  return (
    <fieldset className={cx(styles.stepper, className)} aria-label={label}>
      <button
        type="button"
        className={styles.step}
        aria-label={`Fewer ${label.toLowerCase()}`}
        disabled={disabled || value - step < min}
        onClick={() => onChange(value - step)}
      >
        −
      </button>
      <b className={styles.value} aria-live="polite">
        {value}
      </b>
      <button
        type="button"
        className={styles.step}
        aria-label={`More ${label.toLowerCase()}`}
        disabled={disabled || value + step > max}
        onClick={() => onChange(value + step)}
      >
        +
      </button>
    </fieldset>
  );
}
