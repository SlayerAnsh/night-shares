import styles from "./stepper.module.css";

// Room night amount with minus and plus in 0.1 steps (the book slice).
export function Stepper({
  id,
  label,
  value,
  onChange,
  unit = "room nights",
  step = 0.1,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  unit?: string;
  step?: number;
  disabled?: boolean;
}) {
  function bump(direction: 1 | -1) {
    const current = Number(value) || 0;
    const next = Math.max(
      step,
      Math.round((current + direction * step) * 10) / 10,
    );
    onChange(String(next));
  }
  return (
    <div>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={`${styles.step} ${disabled ? styles.off : ""}`}>
        <button
          type="button"
          aria-label="Less"
          disabled={disabled}
          onClick={() => bump(-1)}
        >
          −
        </button>
        <span className={styles.field}>
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min={step}
            step={step}
            required
            disabled={disabled}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          <span>{unit}</span>
        </span>
        <button
          type="button"
          aria-label="More"
          disabled={disabled}
          onClick={() => bump(1)}
        >
          +
        </button>
      </div>
    </div>
  );
}
