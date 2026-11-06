import type { ReactNode } from "react";
import { cx } from "./cx";
import styles from "./Kpis.module.css";
import ui from "./ui.module.css";

export type KpiTile = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  main?: boolean;
};

/** Row of headline numbers. The `main` tile is the dark one. */
export function Kpis({
  tiles,
  label,
  compact,
}: {
  tiles: KpiTile[];
  label: string;
  compact?: boolean;
}) {
  return (
    <section
      className={cx(styles.kpis, compact && styles.compact)}
      aria-label={label}
    >
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className={cx(ui.card, styles.kpi, tile.main && styles.main)}
        >
          <div className={styles.lbl}>{tile.label}</div>
          <div className={styles.v}>{tile.value}</div>
          {tile.detail && <div className={styles.d}>{tile.detail}</div>}
        </div>
      ))}
    </section>
  );
}
