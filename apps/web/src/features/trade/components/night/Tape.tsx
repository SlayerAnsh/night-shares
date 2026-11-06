import { EmptyState } from "@night-shares/design-system";
import type { TapePrint } from "@night-shares/proto/market/v1/analytics_pb";
import { formatRoomNights } from "../../../../shared/format";
import { clockTime, usd } from "../../model/display";
import text from "../ui/text.module.css";
import styles from "./book.module.css";

const ACTORS = ["Unknown", "Guest", "Trader", "You", "Sell-back", "Agent"];

// Recent trades, newest first: buys in green, sells in red.
export function Tape({ prints }: { prints: TapePrint[] }) {
  if (!prints.length)
    return <EmptyState plain>No trades yet on this market.</EmptyState>;
  return (
    <>
      <div className={styles.tapeCols}>
        <span>Time</span>
        <span>Price</span>
        <span>Size</span>
        <span>Who</span>
      </div>
      <ul className={styles.tape} aria-label="Recent trades">
        {prints.map((print) => (
          <li key={print.id} className={styles.tp}>
            <span className={`${text.num} ${text.muted}`}>
              {clockTime(print.at?.seconds)}
            </span>
            <span
              className={`${text.num} ${print.side === 1 ? text.pos : text.neg}`}
            >
              {usd(print.price?.micros)}
            </span>
            <span className={text.num}>
              {formatRoomNights(print.size?.tenths ?? 0)}
            </span>
            <span
              className={
                print.actor === 3 || print.actor === 5 ? styles.me : text.muted
              }
            >
              {ACTORS[print.actor] ?? "Unknown"}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
