import { Skeleton } from "@night-shares/design-system";
import styles from "./Gallery.module.css";

export function DetailSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton height={64} width="min(520px, 80%)" radius="var(--r-12)" />
      <Skeleton height={16} width={260} className={styles.skelGap} />
      <div className={`${styles.gallery} ${styles.skelGallery}`}>
        <Skeleton height="100%" radius="var(--r-lg)" className={styles.first} />
        <Skeleton height="100%" radius="var(--r-14)" />
        <Skeleton height="100%" radius="var(--r-14)" />
        <Skeleton height="100%" radius="var(--r-14)" />
        <Skeleton height="100%" radius="var(--r-14)" />
      </div>
    </div>
  );
}
