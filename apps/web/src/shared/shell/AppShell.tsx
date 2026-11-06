import { cx } from "@night-shares/design-system";
import type { ReactNode } from "react";
import { AppNav } from "../nav/AppNav";
import type { AppKey } from "../nav/apps";
import styles from "./AppShell.module.css";
import { HeroNav } from "./HeroNav";

export type AppShellProps = {
  app: AppKey;
  // column: the app's page column. bleed: the same column, but a child marked
  // data-bleed spans the full window width (a hero photo). free: no column,
  // each screen sets its own width (trade's night view runs wider).
  layout?: "column" | "bleed" | "free";
  // Transparent nav laid over the hero photo, except on paths ending in solidOn.
  hero?: { solidOn: string[] };
  children: ReactNode;
};

// Nav plus the app's page column. Trade also switches to its own palette.
export function AppShell({
  app,
  layout = "column",
  hero,
  children,
}: AppShellProps) {
  const page = (
    <>
      {hero ? (
        <HeroNav app={app} solidOn={hero.solidOn} />
      ) : (
        <AppNav app={app} />
      )}
      <main className={cx(styles[layout], styles[app])}>{children}</main>
    </>
  );
  if (app !== "trade") return page;
  return (
    <div data-app="trade" className={styles.tradeApp}>
      {page}
    </div>
  );
}
