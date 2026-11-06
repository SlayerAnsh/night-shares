import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "../../shared/nav/Logo";
import styles from "./Login.module.css";

// Page chrome for the World ID step: a small "for Night Shares" mark and one card.
export function LoginFrame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <Link href="/" className={styles.for}>
          <Logo />
          <span>for Night Shares</span>
        </Link>
      </header>
      <main className={styles.main}>
        <section className={styles.card} aria-label="Sign in with World ID">
          {children}
        </section>
      </main>
    </div>
  );
}
