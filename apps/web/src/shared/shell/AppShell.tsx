import { cx } from "@night-shares/design-system";
import type { ReactNode } from "react";
import { AppNav } from "../nav/AppNav";
import type { AppKey } from "../nav/apps";
import styles from "./AppShell.module.css";

// Nav plus the app's page column. Trade also switches to its own palette.
export function AppShell({
  app,
  children,
}: {
  app: AppKey;
  children: ReactNode;
}) {
  const page = (
    <>
      <AppNav app={app} />
      <main className={cx(styles.main, styles[app])}>{children}</main>
    </>
  );
  return app === "trade" ? <div data-app="trade">{page}</div> : page;
}
