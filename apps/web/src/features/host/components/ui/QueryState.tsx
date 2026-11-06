import { Alert, Card, Skeleton } from "@night-shares/design-system";
import type { ReactNode } from "react";
import {
  ErrorState,
  type FallbackLink,
} from "../../../../shared/fallback/ErrorState";
import { errorLine } from "../../../../shared/fallback/error-copy";
import styles from "./QueryState.module.css";

const ALL_HOTELS: FallbackLink = { href: "/host", label: "All hotels" };

/** Styled error line for a failed query or mutation, in plain words. */
export function ErrorNote({ error }: { error?: { message: string } | null }) {
  if (!error) return null;
  return <Alert className={styles.alert}>{errorLine(error)}</Alert>;
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
            <Skeleton key={cell.key} height={cell.h} radius="var(--r-lg)" />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Calm empty card with a title, a line and an optional action. Given an
 * error it becomes an ErrorState: plain words, retry and a way back.
 */
export function StateCard({
  title,
  children,
  action,
  error,
  onRetry,
  back = ALL_HOTELS,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  error?: { message: string } | null;
  onRetry?: () => void;
  // Where the way back goes; null on the page it would point to.
  back?: FallbackLink | null;
}) {
  if (error)
    return (
      <ErrorState
        error={error}
        title={title}
        onRetry={onRetry}
        back={back ?? undefined}
        need="orb"
      >
        {children}
      </ErrorState>
    );
  return (
    <Card as="section" className={styles.box}>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </Card>
  );
}
