import { useId } from "react";
import { formatRoomNights } from "../../../../../shared/format";
import type { roomTotals } from "../../../model/glance";
import { pct } from "../../../model/money";
import { type Fill, Swatch } from "../../ui/StackBar";
import styles from "./Charts.module.css";

const R = 50;
const C = 2 * Math.PI * R;

/** Where the offered rooms are: booked, held by traders, still on sale. */
export function Donut({ total }: { total: ReturnType<typeof roomTotals> }) {
  const hatch = useId();
  const segs: [Fill, string, number][] = [
    ["b", "Booked", total.booked],
    ["h", "Held by traders", total.held],
    ["s", "On sale", total.onSale],
  ];
  const sum = total.booked + total.held + total.onSale;
  let offset = 0;
  return (
    <div className={styles.dWrap}>
      <svg className={styles.donut} viewBox="0 0 132 132" aria-hidden="true">
        <defs>
          <pattern
            id={hatch}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" className={styles.hatchBg} />
            <line x1="0" y1="0" x2="0" y2="6" className={styles.hatch} />
          </pattern>
        </defs>
        <circle cx="66" cy="66" r={R} className={styles.segBase} />
        {segs.map(([fill, , value]) => {
          const len = sum ? (value / sum) * C : 0;
          const start = offset;
          offset += len;
          if (!len) return null;
          return (
            <circle
              key={fill}
              cx="66"
              cy="66"
              r={R}
              className={
                fill === "b"
                  ? styles.segB
                  : fill === "h"
                    ? styles.segH
                    : undefined
              }
              stroke={fill === "s" ? `url(#${hatch})` : undefined}
              strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`}
              strokeDashoffset={(-start).toFixed(2)}
              transform="rotate(-90 66 66)"
            />
          );
        })}
        <text x="66" y="63" textAnchor="middle" className={styles.dV}>
          {pct(total.booked + total.held, sum)}
        </text>
        <text x="66" y="81" textAnchor="middle" className={styles.dL}>
          taken
        </text>
      </svg>
      <ul className={styles.dList}>
        {segs.map(([fill, label, value]) => (
          <li key={fill}>
            <Swatch fill={fill} />
            <span>{label}</span>
            <b>{formatRoomNights(value)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
