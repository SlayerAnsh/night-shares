import { Switch } from "@night-shares/design-system";
import styles from "./toggle.module.css";

// Design system Switch with its visible label, for the "show only" filters.
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the Switch button inside is the control.
    <label className={`${styles.tog} ${checked ? styles.on : ""}`}>
      <Switch checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}
