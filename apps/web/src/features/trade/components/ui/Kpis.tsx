import type { ReactNode } from "react";
import styles from "./kpis.module.css";
import text from "./text.module.css";

export type Kpi = {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "pos" | "neg" | "flat" | "";
  big?: boolean;
  extra?: ReactNode;
};

// A row of figures split by hairlines. "strip" is the night header,
// "large" the discover and portfolio summaries.
export function Kpis({
  items,
  label,
  variant = "strip",
}: {
  items: Kpi[];
  label: string;
  variant?: "strip" | "large";
}) {
  return (
    <dl className={`${styles.kpis} ${styles[variant]}`} aria-label={label}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>
            <span
              className={[
                text.fig,
                item.tone ? text[item.tone] : "",
                item.big ? styles.big : "",
              ].join(" ")}
            >
              {item.value}
            </span>
            {item.sub && <small>{item.sub}</small>}
            {item.extra}
          </dd>
        </div>
      ))}
    </dl>
  );
}
