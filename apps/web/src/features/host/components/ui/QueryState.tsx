import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cx";
import styles from "./QueryState.module.css";
import ui from "./ui.module.css";

/** Styled error line for a failed query or mutation. */
export function ErrorNote({ error }: { error?: { message: string } | null }) {
  if (!error) return null;
  return (
    <p role="alert" className={styles.alert}>
      {error.message}
    </p>
  );
}

/** Placeholder blocks shaped like the page that is loading. */
export function Loading({
  label,
  rows = [[110, 110, 110, 110], [320]],
}: {
  label: string;
  rows?: number[][];
}) {
  const shaped = rows.map((row, r) => ({
    key: `row-${r}`,
    cells: row.map((h, i) => ({ key: `${r}-${i}`, h })),
  }));
  return (
    <div className={styles.skeleton} role="status" aria-label={label}>
      {shaped.map((row) => (
        <div key={row.key} className={styles.row}>
          {row.cells.map((cell) => (
            <div
              key={cell.key}
              className={styles.block}
              style={{ "--h": `${cell.h}px` } as CSSProperties}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Calm empty or error card with a title, a line and an optional action. */
export function StateCard({
  title,
  children,
  action,
  error,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  error?: { message: string } | null;
}) {
  return (
    <section className={cx(ui.card, styles.box)}>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      <ErrorNote error={error} />
      {action && <div className={styles.action}>{action}</div>}
    </section>
  );
}

export function Spinner() {
  return <span className={styles.spin} aria-hidden="true" />;
}
