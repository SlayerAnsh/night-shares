import { cx } from "@night-shares/design-system";
import Link from "next/link";
import { AccountMenu } from "./AccountMenu";
import styles from "./AppNav.module.css";
import { AppSwitcher } from "./AppSwitcher";
import { type AppKey, apps } from "./apps";
import { Brand } from "./Brand";
import { SectionLinks } from "./SectionLinks";

export type AppNavProps = {
  // Current app, or null on pages outside the three apps (landing).
  app: AppKey | null;
  // Transparent nav laid over a full bleed hero photo.
  hero?: boolean;
};

// Top bar shared by every app: brand, app switcher, app sections, account.
export function AppNav({ app, hero = false }: AppNavProps) {
  const info = app ? apps[app] : null;
  return (
    <header
      className={cx(styles.nav, hero && styles.hero)}
      data-on-hero={hero || undefined}
    >
      <Brand />
      <AppSwitcher current={app} />
      {info?.sections && (
        <SectionLinks links={info.sections} label={`${info.name} sections`} />
      )}
      <div className={styles.right}>
        {info?.navLink && (
          <Link className={styles.link} href={info.navLink.href}>
            {info.navLink.label}
          </Link>
        )}
        <AccountMenu app={info} />
      </div>
    </header>
  );
}
