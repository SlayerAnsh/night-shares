import type { ReactNode } from "react";
import styles from "./section.module.css";

// A block with a clear start (title and one line) and a clear end (hairline).
export function Section({
  id,
  title,
  line,
  actions,
  children,
  plain = false,
}: {
  id: string;
  title: string;
  line?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  plain?: boolean;
}) {
  return (
    <section className={plain ? styles.plain : styles.sec} aria-labelledby={id}>
      <div className={styles.head}>
        <div>
          <h2 id={id}>{title}</h2>
          {line && <p>{line}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      {children}
    </section>
  );
}
