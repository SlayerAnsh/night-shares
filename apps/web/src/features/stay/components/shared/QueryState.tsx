import { Alert, Spinner } from "@night-shares/design-system";
import { errorLine } from "../../../../shared/fallback/error-copy";
import styles from "./QueryState.module.css";

// Loading and error line for one query or action, in plain words (no codes).
// Renders nothing once data is in. Whole page failures use ErrorState.
export function QueryState({
  pending,
  error,
  label = "Loading…",
}: {
  pending?: boolean;
  error?: unknown;
  label?: string;
}) {
  if (error) return <Alert>{errorLine(error)}</Alert>;
  if (!pending) return null;
  return (
    <p className={styles.pending}>
      <Spinner label={label} />
      <span aria-hidden="true">{label}</span>
    </p>
  );
}
