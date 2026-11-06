import type { ReactNode } from "react";
import { cx } from "../cx";
import strip from "./KpisStrip.module.css";
import tiles from "./KpisTiles.module.css";

export type KpiItem = {
  label: string;
  value: ReactNode;
  // Tiles: a line under the value. Strip and large: a small note after it.
  detail?: ReactNode;
  // Colors the value: up, down or unchanged.
  tone?: "pos" | "neg" | "flat";
  // Strip only: a larger value, for the headline price.
  big?: boolean;
  // Anything after the value and detail, for example a status dot.
  extra?: ReactNode;
  // Tiles only: the one ink tile in the row.
  inverse?: boolean;
};

export type KpisProps = {
  items: KpiItem[];
  // Names the row for screen readers.
  label: string;
  // tiles and compact are host cards (.kpi); strip and large are trade rows split by hairlines.
  variant?: "tiles" | "compact" | "strip" | "large";
  className?: string;
};

// A row of headline figures: label, value and an optional detail.
export function Kpis({
  items,
  label,
  variant = "tiles",
  className,
}: KpisProps) {
  const s = variant === "strip" || variant === "large" ? strip : tiles;
  return (
    <dl className={cx(s.kpis, s[variant], className)} aria-label={label}>
      {items.map((item) => (
        <div key={item.label} className={cx(s.item, item.inverse && s.inverse)}>
          <dt className={s.label}>{item.label}</dt>
          <dd className={s.dd}>
            <span
              className={cx(
                s.value,
                item.tone && s[item.tone],
                item.big && s.big,
              )}
            >
              {item.value}
            </span>
            {item.detail && <span className={s.detail}>{item.detail}</span>}
            {item.extra}
          </dd>
        </div>
      ))}
    </dl>
  );
}
