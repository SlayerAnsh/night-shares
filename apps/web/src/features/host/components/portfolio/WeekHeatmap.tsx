import type { Occupancy } from "@night-shares/proto/host/v1/hotel_pb";
import type { CSSProperties } from "react";
import { dayMonth } from "../../model/calendar";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import styles from "./WeekHeatmap.module.css";

type Pick = (row: Occupancy) => number;
const ROWS: [string, Pick, string][] = [
  ["Booked by guests", (r) => r.booked?.tenths ?? 0, "var(--pos)"],
  ["Held by traders", (r) => r.held?.tenths ?? 0, "var(--accent)"],
];
const taken: Pick = (r) => (r.booked?.tenths ?? 0) + (r.held?.tenths ?? 0);

// Shade over the share range that occupancy really covers; light text only on the darkest cells.
function Cell({
  part,
  whole,
  tone,
}: {
  part: number;
  whole: number;
  tone: string;
}) {
  const v = whole ? part / whole : 0;
  const t = Math.min(1, Math.max(0, v / 0.8));
  const style = {
    "--o": `${Math.round(8 + t * 80)}%`,
    "--tone": tone,
  } as CSSProperties;
  return (
    <td style={style} className={cx(t >= 0.7 && styles.hi)}>
      {whole ? `${Math.round(v * 100)}%` : "–"}
    </td>
  );
}

/** Next 8 weeks across every connected hotel, as a share of rooms offered. */
export function WeekHeatmap({ rows }: { rows: Occupancy[] }) {
  const offered = (r: Occupancy) => r.allotment?.tenths ?? 0;
  const shares = rows.map((r) => (offered(r) ? taken(r) / offered(r) : 0));
  const best = shares.indexOf(Math.max(...shares));
  const all = rows.reduce((s, r) => s + offered(r), 0);
  const avg = all ? rows.reduce((s, r) => s + taken(r), 0) / all : 0;
  return (
    <section className={cx(ui.card, styles.card)} aria-labelledby="wk-h">
      <div className={styles.head}>
        <div>
          <h2 id="wk-h">Occupancy by week</h2>
          <p className={ui.muted}>
            Rooms booked or held as a percent of rooms offered, next 8 weeks,
            all connected hotels.
          </p>
        </div>
        {rows[best] && (
          <p className={styles.sum}>
            Avg {Math.round(avg * 100)}%, busiest week of{" "}
            {dayMonth(rows[best].date)}
          </p>
        )}
      </div>
      <div className={styles.scroll}>
        <table className={styles.wk}>
          <thead>
            <tr>
              <td />
              {rows.map((r) => (
                <th key={r.date} scope="col">
                  {dayMonth(r.date)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([label, pick, tone]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {rows.map((r) => (
                  <Cell
                    key={r.date}
                    part={pick(r)}
                    whole={offered(r)}
                    tone={tone}
                  />
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Booked or held</th>
              {rows.map((r) => (
                <Cell
                  key={r.date}
                  part={taken(r)}
                  whole={offered(r)}
                  tone="var(--pos)"
                />
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
