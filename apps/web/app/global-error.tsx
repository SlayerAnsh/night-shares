"use client";
import "@night-shares/design-system/tokens.css";
import "@night-shares/design-system/base.css";
import { Button, buttonClass } from "@night-shares/design-system";
import styles from "../src/shared/fallback/Fallback.module.css";
import { fontVariables } from "../src/shared/fonts/fonts";

// Last resort when the root layout itself fails: no providers, so no nav or
// query hooks, just the message and a reload.
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en" className={fontVariables}>
      <body>
        <main className={styles.page}>
          <section className={styles.state}>
            <span className={styles.eyebrow}>Could not load</span>
            <h1 className={styles.title}>Night Shares hit a problem</h1>
            <p className={styles.text}>
              The page could not start. Try again, and if it keeps happening
              come back in a few minutes.
            </p>
            <div className={styles.actions}>
              <Button variant="primary" onClick={reset}>
                Try again
              </Button>
              <a href="/" className={buttonClass({ variant: "text" })}>
                Go to the home page
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
