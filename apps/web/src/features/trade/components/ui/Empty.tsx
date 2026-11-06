import type { ReactNode } from "react";
import styles from "./empty.module.css";

export function Empty({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}
