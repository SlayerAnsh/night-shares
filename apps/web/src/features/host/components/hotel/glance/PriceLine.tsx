"use client";
import { useWidth } from "../../../hooks/use-width";
import { dayMonth } from "../../../model/calendar";
import type { PricePoint } from "../../../model/glance";
import styles from "./Charts.module.css";

const H = 210;
const L = 52;
const R = 12;
const T = 16;
const B = 26;
const usd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

/** Guest price against the usual rate over the next nights, shaded where it sells above. */
export function PriceLine({
  points,
  label,
}: {
  points: PricePoint[];
  label: string;
}) {
  const [ref, measured] = useWidth<HTMLDivElement>(600);
  const w = Math.max(280, measured);
  const values = points.flatMap((p) =>
    p.price === undefined ? [p.usual] : [p.usual, p.price],
  );
  if (points.length < 2 || !values.length)
    return <div ref={ref} className={styles.pl} />;
  const lo = Math.min(...values) * 0.95;
  const hi = Math.max(...values) * 1.03;
  const iw = w - L - R;
  const ih = H - T - B;
  const xAt = (i: number) => L + (i / (points.length - 1)) * iw;
  const yAt = (v: number) => T + (1 - (v - lo) / (hi - lo || 1)) * ih;
  const xy = (i: number, v: number) =>
    `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`;
  const usual = points
    .map((p, i) => `${i ? "L" : "M"}${xy(i, p.usual)}`)
    .join("");
  // Market line and above-usual area, in runs wherever rooms are on sale.
  let market = "";
  let area = "";
  let run: number[] = [];
  const flush = () => {
    if (run.length) {
      market += run
        .map((i, j) => `${j ? "L" : "M"}${xy(i, points[i]?.price ?? 0)}`)
        .join("");
      const up = run.map((i) =>
        xy(i, Math.max(points[i]?.price ?? 0, points[i]?.usual ?? 0)),
      );
      const down = [...run].reverse().map((i) => xy(i, points[i]?.usual ?? 0));
      area += `M${up.join("L")}L${down.join("L")}Z`;
    }
    run = [];
  };
  points.forEach((p, i) => {
    if (p.price === undefined) flush();
    else run.push(i);
  });
  flush();
  const ticks = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.1];
  const last = points.length - 1;
  const xt = [0, Math.round(last / 3), Math.round((2 * last) / 3), last];
  return (
    <div ref={ref} className={styles.pl}>
      <svg
        width={w}
        height={H}
        viewBox={`0 0 ${w} ${H}`}
        role="img"
        aria-label={label}
      >
        <title>{label}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={L}
              x2={L + iw}
              y1={yAt(t)}
              y2={yAt(t)}
              className={styles.grid}
            />
            <text
              x={L - 8}
              y={yAt(t) + 4}
              textAnchor="end"
              className={styles.ax}
            >
              {usd(t)}
            </text>
          </g>
        ))}
        <path d={area} className={styles.above} />
        <path d={usual} className={styles.usual} />
        <path d={market} className={styles.mkt} />
        {xt.map((i) => (
          <text
            key={i}
            x={xAt(i)}
            y={H - 6}
            textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}
            className={styles.ax}
          >
            {i === 0 ? "Today" : dayMonth(points[i]?.date ?? "")}
          </text>
        ))}
      </svg>
    </div>
  );
}
