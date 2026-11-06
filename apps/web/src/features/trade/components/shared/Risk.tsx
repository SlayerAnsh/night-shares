import { riskName } from "../../model/market";
import styles from "./risk.module.css";

// Risk is a small dot plus a word, never a filled badge.
export function Risk({ risk, size }: { risk: number; size?: "large" }) {
  const name = riskName(risk);
  return (
    <span
      className={`${styles.risk} ${styles[name.toLowerCase()] ?? ""} ${size ? styles.large : ""}`}
    >
      <i aria-hidden="true" />
      {name}
    </span>
  );
}
