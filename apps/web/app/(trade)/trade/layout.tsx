import type { ReactNode } from "react";
import { AppNav } from "../../../src/shared/nav/AppNav";
import styles from "./trade-layout.module.css";

// The trade palette is scoped by data-app on this wrapper (tokens.css).
// Each screen sets its own page width: the night view runs wider than the rest.
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div data-app="trade" className={styles.app}>
      <AppNav app="trade" />
      <main>{children}</main>
    </div>
  );
}
