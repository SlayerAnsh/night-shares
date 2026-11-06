import type { GetBookResponse } from "@night-shares/proto/market/v1/market_pb";
import type { CSSProperties } from "react";
import { formatRoomNights } from "../../../../shared/format";
import { usd } from "../../model/display";
import { percent, sourceName } from "../../model/market";
import text from "../ui/text.module.css";
import styles from "./book.module.css";
import { bookRows } from "./book-rows";

// Calm, tabular ladder. Depth is a subtle fill; picking a level fills the order box.
export function OrderBook({
  book,
  onPick,
}: {
  book: GetBookResponse;
  onPick: (mode: "buy" | "sell", tenths: number) => void;
}) {
  const late = book.lateFeeBps > 0;
  const rows = bookRows(book);
  return (
    <>
      <div className={styles.cols}>
        <span>Price</span>
        <span>Room nights</span>
        <span>{late ? "Source or net" : "Source"}</span>
      </div>
      <div className={styles.book}>
        {rows.map((row) => {
          if (row.kind === "recall")
            return (
              <div key="recall" className={`${styles.mark} ${styles.recall}`}>
                Guest price cap {usd(row.price)}
              </div>
            );
          if (row.kind === "fair")
            return (
              <div key="fair" className={`${styles.mark} ${styles.fair}`}>
                Fair {usd(row.price)}
              </div>
            );
          if (row.kind === "spread")
            return (
              <div key="spread" className={styles.spread}>
                <span>Spread</span>
                <b className={text.num}>
                  {row.spread === undefined ? "n/a" : usd(row.spread)}
                </b>
                <span className={styles.mid}>mid {usd(row.price)}</span>
              </div>
            );
          const { level } = row;
          const isAsk = row.kind === "ask";
          const size = formatRoomNights(row.cumulative);
          return (
            <button
              key={`${row.kind}-${level.askId}-${level.source}-${level.price?.micros}`}
              type="button"
              className={`${styles.row} ${isAsk ? styles.ask : styles.bid}`}
              style={{ "--w": `${row.depth * 100}%` } as CSSProperties}
              aria-label={`${isAsk ? "Buy" : "Sell"} ${size} room nights, ${isAsk ? "up" : "down"} to ${usd(level.price?.micros)}`}
              onClick={() => onPick(isAsk ? "buy" : "sell", row.cumulative)}
            >
              <span className={`${styles.p} ${text.num}`}>
                {usd(level.price?.micros)}
              </span>
              <span className={text.num}>
                {formatRoomNights(level.size?.tenths ?? 0)}
              </span>
              <span className={styles.s}>
                {isAsk
                  ? sourceName(level.source)
                  : late
                    ? `net ${usd(level.net?.micros)}`
                    : "Sell-back"}
              </span>
            </button>
          );
        })}
      </div>
      <p className={styles.foot}>
        Asks in red, sell-back bids in green at gross price. Selling back costs
        a {late ? `late fee, now ${percent(book.lateFeeBps)}` : "fee"}. At the
        guest price cap, guests can take held room nights back, largest holder
        first.
      </p>
    </>
  );
}
