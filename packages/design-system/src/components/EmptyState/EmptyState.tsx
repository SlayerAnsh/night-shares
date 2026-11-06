import type { ReactNode } from "react";
import { cx } from "../cx";
import styles from "./EmptyState.module.css";

export type EmptyStateProps = {
  title: ReactNode;
  children?: ReactNode;
  // Usually one Button, for example "Clear search".
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  title,
  children,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cx(styles.empty, className)}>
      <h3 className={styles.title}>{title}</h3>
      {children && <p className={styles.body}>{children}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
