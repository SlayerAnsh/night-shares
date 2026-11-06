import type { TableHTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./Table.module.css";

export type TableProps = TableHTMLAttributes<HTMLTableElement>;

// A native table that scrolls sideways on narrow screens. Write thead and tbody as usual.
export function Table({ className, ...rest }: TableProps) {
  return (
    <div className={styles.wrap}>
      <table className={cx(styles.table, className)} {...rest} />
    </div>
  );
}
