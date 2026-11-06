import { cx } from "@night-shares/design-system";
import type { Activity } from "@night-shares/proto/host/v1/hotel_pb";
import { formatRoomNights } from "../../../../shared/format";
import {
  activityLabel,
  activityRows,
  activityTone,
} from "../../model/activity";
import { instantMs, shortInstant } from "../../model/calendar";
import { usd } from "../../model/money";
import ui from "../ui/ui.module.css";
import styles from "./ActivityTable.module.css";

const at = (row: { at?: Activity["at"] }) => (row.at ? instantMs(row.at) : 0);

/** Market activity on this night in plain words, newest first. */
export function ActivityTable({ events }: { events: Activity[] }) {
  if (!events.length) return <p className={ui.note}>No activity yet.</p>;
  const rows = activityRows(events).sort((a, b) => at(b) - at(a));
  return (
    <table className={styles.act}>
      <caption className={ui.srOnly}>Market activity</caption>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td className={styles.when}>{shortInstant(row.at)}</td>
            <td>
              <span
                className={cx(styles.ico, styles[activityTone(row.kind)])}
                aria-hidden="true"
              />
              {activityLabel(row.kind)}
              {row.tenths > 0 && (
                <small>{formatRoomNights(row.tenths)} rooms</small>
              )}
            </td>
            <td className={styles.amt}>{row.micros ? usd(row.micros) : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
