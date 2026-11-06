"use client";
import { useState } from "react";
import { useElementSize } from "../../hooks/use-element-size";
import { ChartAxes } from "./ChartAxes";
import { ChartTip } from "./ChartTip";
import styles from "./chart.module.css";
import { domain, linePath, type Point, spreadLabels } from "./chart-scale";

const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const day = (at: number) =>
  new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// Market price line with a dashed reference (fair price or cost), end labels
// on the right, and a hover or keyboard read out per point (mock drawChart).
export function PriceChart({
  points,
  reference,
  referenceLabel = "Fair",
  lineLabel = "Price",
  className,
  label,
}: {
  points: Point[];
  reference?: number;
  referenceLabel?: string;
  lineLabel?: string;
  className?: string;
  label: string;
}) {
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const n = points.length;
  const values = points.map((p) => p.value);
  const { min, max } = domain(
    reference === undefined ? values : [...values, reference],
  );
  const small = width < 480;
  const left = small ? 44 : 52;
  const w = width - (small ? 84 : 112);
  const top = 8;
  const bottom = height - 22;
  const x = (i: number) =>
    left + (n > 1 ? (i / (n - 1)) * (w - left) : (w - left) / 2);
  const y = (v: number) => top + ((max - v) / (max - min)) * (bottom - top);
  const last = points[n - 1];
  const pick = (i: number) => setActive(Math.max(0, Math.min(n - 1, i)));
  const [yLast, yRef] = last
    ? spreadLabels(y(last.value), y(reference ?? last.value), top, bottom)
    : [0, 0];
  const hit = active === null ? undefined : points[active];
  return (
    <div
      ref={ref}
      className={`${styles.chart} ${className ?? ""}`}
      role="application"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: arrow keys read each point
      tabIndex={0}
      aria-label={`${label}. Use the left and right arrow keys to read each point.`}
      onMouseMove={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        pick(
          Math.round(((e.clientX - box.left - left) / (w - left)) * (n - 1)),
        );
      }}
      onMouseLeave={() => setActive(null)}
      onFocus={() => setActive(n - 1)}
      onBlur={() => setActive(null)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        pick((active ?? n - 1) + (e.key === "ArrowRight" ? 1 : -1));
      }}
    >
      {width > 0 && height > 0 && last && (
        <svg width={width} height={height} aria-hidden="true">
          <ChartAxes
            left={left}
            right={w}
            height={height}
            y={y}
            ticks={[0.15, 0.5, 0.85].map((r) => min + (max - min) * r)}
            format={fmt}
            dates={[0, Math.round((n - 1) / 2), n - 1].map((i) => ({
              x: x(i),
              text: i === n - 1 ? "Now" : day(points[i]?.at ?? 0),
            }))}
          />
          {reference !== undefined && (
            <line
              x1={left}
              x2={w}
              y1={y(reference)}
              y2={y(reference)}
              className={styles.fair}
            />
          )}
          <path
            d={linePath(
              points.map((_, i) => x(i)),
              values.map(y),
            )}
            className={styles.line}
          />
          <circle
            cx={x(n - 1)}
            cy={y(last.value)}
            r={3.5}
            className={styles.dot}
          />
          <text x={w + 10} y={yLast - 2} className={styles.endKey}>
            {lineLabel}
          </text>
          <text x={w + 10} y={yLast + 12} className={styles.endValue}>
            {fmt(last.value)}
          </text>
          {reference !== undefined && (
            <>
              <text x={w + 10} y={yRef - 2} className={styles.endKey}>
                {referenceLabel}
              </text>
              <text
                x={w + 10}
                y={yRef + 12}
                className={`${styles.endValue} ${styles.endFair}`}
              >
                {fmt(reference)}
              </text>
            </>
          )}
          {active !== null && (
            <line
              x1={x(active)}
              x2={x(active)}
              y1={top}
              y2={bottom}
              className={styles.guide}
            />
          )}
        </svg>
      )}
      {active !== null && hit && (
        <ChartTip
          x={x(active)}
          width={width}
          title={active === n - 1 ? "Now" : day(hit.at)}
          rows={[
            [lineLabel, fmt(hit.value)],
            ...(reference === undefined
              ? []
              : [[referenceLabel, fmt(reference)] as [string, string]]),
          ]}
        />
      )}
    </div>
  );
}
