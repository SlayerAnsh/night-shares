import styles from "./Login.module.css";

export function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className={styles.error} role="alert">
      {message}
    </p>
  );
}
