import { Skeleton as DsSkeleton } from "@night-shares/design-system";
import styles from "./skeleton.module.css";

// Placeholder rows (design system Skeleton) while a query loads.
export function Skeleton({
  rows = 6,
  label,
  height = 52,
}: {
  rows?: number;
  label: string;
  height?: number;
}) {
  return (
    <div className={styles.wrap} role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <DsSkeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          key={index}
          className={styles.row}
          height={height - 12}
        />
      ))}
    </div>
  );
}
