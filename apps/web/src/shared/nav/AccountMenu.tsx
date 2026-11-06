"use client";
import { cx } from "@night-shares/design-system";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { loginHref } from "../../session/access";
import { signOut } from "../../session/actions";
import { useSession } from "../../session/SessionProvider";
import styles from "./AccountMenu.module.css";
import type { AppInfo } from "./apps";
import { useMenu } from "./use-menu";
import { WorldIdGlyph } from "./WorldIdGlyph";

const short = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;

// Sign in link when signed out; World ID chip with an account menu when signed in.
export function AccountMenu({ app }: { app: AppInfo | null }) {
  const { user, level, refresh } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const menu = useMenu();
  if (!user) {
    return (
      <Link
        className={styles.signin}
        href={loginHref(
          pathname,
          app?.why ?? "continue",
          app?.need ?? "device",
        )}
      >
        Sign in
      </Link>
    );
  }
  const levelName = level === "orb" ? "Orb" : "Device";
  async function onSignOut() {
    menu.setOpen(false);
    await signOut();
    await refresh();
    router.refresh();
  }
  return (
    <div ref={menu.box} className={styles.wrap}>
      <button
        type="button"
        className={styles.chip}
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        aria-label={`Account, signed in with World ID, ${levelName}`}
        onKeyDown={menu.onKeyDown}
        onClick={() => menu.setOpen(!menu.isOpen)}
      >
        <span className={styles.avatar}>
          <WorldIdGlyph />
        </span>
        <span className={styles.level}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.levelText}>World ID · {levelName}</span>
        </span>
      </button>
      {menu.isOpen && (
        <div className={styles.menu} role="menu" onKeyDown={menu.onKeyDown}>
          <div className={styles.head}>
            <span className={styles.dot} aria-hidden="true" />
            <div>
              <b>World ID verified</b>
              <span className={styles.sub}>
                {level === "orb" ? "Orb, unique human" : "Device"}
              </span>
            </div>
          </div>
          <div className={styles.wallet}>
            <span className={styles.sub}>USDC wallet on Arc</span>
            <b>{short(user.walletAddress)}</b>
          </div>
          {app?.links.map((link) => (
            <Link
              key={link.href}
              role="menuitem"
              className={styles.item}
              href={link.href}
              onClick={() => menu.setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <button
            type="button"
            role="menuitem"
            className={cx(styles.item, styles.out)}
            onClick={() => void onSignOut()}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
