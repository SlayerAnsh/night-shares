import type { HotelSummary } from "@night-shares/proto/host/v1/hotel_pb";
import {
  SCAN_NOTE,
  validWalks,
  WALK_LIMIT,
  WALK_RULE,
  walkStanding,
} from "../../model/walks";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import styles from "./Walks.module.css";

/** The host's public record across every hotel, against the limit that stops new nights. */
export function WalkStrip({ hotels }: { hotels: HotelSummary[] }) {
  const count = hotels.reduce(
    (n, hotel) => n + validWalks(hotel.walkIncidents).length,
    0,
  );
  const standing = walkStanding(count);
  return (
    <section
      className={cx(ui.card, styles.strip)}
      aria-labelledby="walk-record"
    >
      <div className={cx(styles.num, styles[standing.tone])}>
        <span className={ui.lbl}>Guests turned away</span>
        <b>{count}</b>
        <span>of {WALK_LIMIT}, all hotels</span>
      </div>
      <div className={styles.body}>
        <h2 id="walk-record">Your public record</h2>
        <p className={cx(styles.st, styles[standing.tone])}>{standing.text}</p>
        <p className={ui.note}>
          {WALK_RULE} {SCAN_NOTE}
        </p>
      </div>
    </section>
  );
}
