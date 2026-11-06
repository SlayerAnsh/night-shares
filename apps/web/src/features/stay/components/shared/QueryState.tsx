import { ConnectError } from "@connectrpc/connect";
import { Alert, Spinner } from "@night-shares/design-system";
import styles from "./QueryState.module.css";

// Loading and error line for one query. Renders nothing once data is in.
export function QueryState({
  pending,
  error,
  label = "Loading…",
}: {
  pending?: boolean;
  error?: unknown;
  label?: string;
}) {
  if (error) return <Alert>{ConnectError.from(error).rawMessage}</Alert>;
  if (!pending) return null;
  return (
    <p className={styles.pending}>
      <Spinner label={label} />
      <span aria-hidden="true">{label}</span>
    </p>
  );
}
