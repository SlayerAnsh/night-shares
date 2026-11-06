import { Skeleton } from "@night-shares/design-system";
import styles from "./Results.module.css";

export function StayCardSkeleton() {
  return (
    <div className={styles.card} aria-hidden="true">
      <Skeleton className={styles.media} radius="var(--r-lg)" height="auto" />
      <div className={styles.body}>
        <Skeleton height={14} />
        <Skeleton height={14} width="60%" className={styles.skelGap} />
      </div>
    </div>
  );
}
