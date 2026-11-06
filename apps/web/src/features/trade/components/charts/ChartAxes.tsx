import styles from "./chart.module.css";

// Three hairline gridlines with value labels on the left and three dates below.
export function ChartAxes({
  left,
  right,
  height,
  y,
  ticks,
  format,
  dates,
}: {
  left: number;
  right: number;
  height: number;
  y: (value: number) => number;
  ticks: number[];
  format: (value: number) => string;
  dates: { x: number; text: string }[];
}) {
  return (
    <>
      {ticks.map((value) => (
        <g key={value}>
          <line
            x1={left}
            x2={right}
            y1={y(value)}
            y2={y(value)}
            className={styles.grid}
          />
          <text
            x={left - 8}
            y={y(value) + 4}
            textAnchor="end"
            className={styles.tick}
          >
            {format(value)}
          </text>
        </g>
      ))}
      {dates.map((date, index) => (
        <text
          key={`${date.text}-${date.x}`}
          x={date.x}
          y={height - 6}
          textAnchor={
            index === 0
              ? "start"
              : index === dates.length - 1
                ? "end"
                : "middle"
          }
          className={styles.tick}
        >
          {date.text}
        </text>
      ))}
    </>
  );
}
