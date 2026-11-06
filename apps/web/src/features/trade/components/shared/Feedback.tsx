import styles from "./feedback.module.css";

// Errors and confirmations as one quiet line with a coloured rule.
export function Feedback({
  error,
  notice,
}: {
  error?: string;
  notice?: string;
}) {
  return (
    <>
      {error && (
        <p role="alert" className={`${styles.line} ${styles.error}`}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={`${styles.line} ${styles.notice}`}>
          {notice}
        </p>
      )}
    </>
  );
}
