import { Spinner } from "@night-shares/design-system";
import styles from "./QueryState.module.css";

// Route level fallback while a Stay screen reads its URL state.
export function PageLoading({ label }: { label: string }) {
  return (
    <div className={styles.page}>
      <Spinner size="lg" label={label} />
    </div>
  );
}
