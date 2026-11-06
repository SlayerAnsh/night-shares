import { Skeleton } from "@night-shares/design-system";
import styles from "./GatePreview.module.css";

/**
 * The outline of a signed in page (figure labels, then rows) drawn with
 * placeholders. It sits blurred behind a SignInGate, so no real or made up
 * numbers are shown.
 */
export function GatePreview({
  figures,
  rows = 5,
}: {
  figures: string[];
  rows?: number;
}) {
  return (
    <div className={styles.pv}>
      <div className={styles.pvFigs}>
        {figures.map((label) => (
          <div key={label} className={styles.pvFig}>
            <span>{label}</span>
            <Skeleton height={26} width="70%" />
          </div>
        ))}
      </div>
      <div className={styles.pvRows}>
        {Array.from({ length: rows }, (_, i) => `row-${i}`).map((key) => (
          <div key={key} className={styles.pvRow}>
            <Skeleton height={14} width="38%" />
            <Skeleton height={14} width="14%" />
            <Skeleton height={14} width="12%" />
          </div>
        ))}
      </div>
    </div>
  );
}
