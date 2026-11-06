import { errorLine } from "../../shared/fallback/error-copy";
import styles from "./Login.module.css";

// Sign in failures in plain words: a Connect code from the API is rewritten,
// a sentence from World ID is kept.
export function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className={styles.error} role="alert">
      {errorLine(message)}
    </p>
  );
}
