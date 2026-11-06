import type { ReactNode } from "react";
import { cx } from "../cx";
import styles from "./EmptyState.module.css";

export type EmptyStateProps =
  | {
      title: ReactNode;
      children?: ReactNode;
      // Usually one Button, for example "Clear search".
      action?: ReactNode;
      plain?: false;
      className?: string;
    }
  | {
      // One muted line with no title, for an empty list or table.
      plain: true;
      children: ReactNode;
      title?: never;
      action?: never;
      className?: string;
    };

export function EmptyState(props: EmptyStateProps) {
  const { children, className } = props;
  if (props.plain)
    return (
      <p className={cx(styles.empty, styles.plain, className)}>{children}</p>
    );
  return (
    <div className={cx(styles.empty, className)}>
      <h3 className={styles.title}>{props.title}</h3>
      {children && <p className={styles.body}>{children}</p>}
      {props.action && <div className={styles.action}>{props.action}</div>}
    </div>
  );
}
