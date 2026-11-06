"use client";
import { useLayoutEffect, useRef, useState } from "react";
import styles from "./chart.module.css";

// Floating read out above a chart, kept inside the chart's width.
export function ChartTip({
  x,
  width,
  title,
  rows,
}: {
  x: number;
  width: number;
  title: string;
  rows: [string, string][];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(x);
  useLayoutEffect(() => {
    const tip = ref.current?.offsetWidth ?? 0;
    setLeft(Math.max(0, Math.min(width - tip, x - tip / 2)));
  }, [x, width]);
  return (
    <div ref={ref} className={styles.tip} style={{ left }} aria-hidden="true">
      <b>{title}</b>
      {rows.map(([key, value]) => (
        <span key={key}>
          {key} <b>{value}</b>
        </span>
      ))}
    </div>
  );
}
