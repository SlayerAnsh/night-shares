import { errorLine } from "../../../../shared/fallback/error-copy";
import styles from "./feedback.module.css";

// Errors and confirmations as one quiet line with a coloured rule. Errors are
// rewritten in plain words, so a Connect code never reaches the screen.
export function Feedback({
  error,
  notice,
}: {
  error?: unknown;
  notice?: string;
}) {
  return (
    <>
      {error ? (
        <p role="alert" className={`${styles.line} ${styles.error}`}>
          {errorLine(error)}
        </p>
      ) : null}
      {notice && (
        <p role="status" className={`${styles.line} ${styles.notice}`}>
          {notice}
        </p>
      )}
    </>
  );
}
