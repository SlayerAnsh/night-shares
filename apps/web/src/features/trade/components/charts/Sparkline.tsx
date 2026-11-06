import styles from "./chart.module.css";

// Small trend line for table rows (mock spark7): green when it ends higher.
export function Sparkline({
  values,
  width = 56,
  height = 18,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const up = (values[values.length - 1] ?? 0) >= (values[0] ?? 0);
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y =
        height - 2 - (max - min ? (v - min) / (max - min) : 0.5) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      className={`${styles.spark} ${up ? styles.sparkPos : styles.sparkNeg}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
