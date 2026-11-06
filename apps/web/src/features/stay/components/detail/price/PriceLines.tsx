import type { StayQuote } from "@night-shares/proto/stay/v1/trip_pb";
import { formatUsdc } from "../../../../../shared/format";
import { formatWeekday, plural } from "../../../model/dates";
import { summarizeQuote } from "../../../model/quote";
import styles from "./Price.module.css";

// Stay total as lines (.lines): average times nights, nightly breakdown,
// total and the fee it includes.
export function PriceLines({ quote }: { quote: StayQuote }) {
  const s = summarizeQuote(quote);
  return (
    <div className={styles.lines}>
      <div>
        <span>
          {formatUsdc(s.perNight)} × {plural(s.nights, "night")}
          {s.rooms > 1 && ` × ${s.rooms} rooms`}
        </span>
        <span>{formatUsdc(s.total)}</span>
      </div>
      <details className={styles.breakdown}>
        <summary>Nightly breakdown</summary>
        <div className={styles.nights}>
          {quote.nights.map((n) => (
            <div key={n.date}>
              <span>{formatWeekday(n.date)}</span>
              <span className={styles.mono}>
                {formatUsdc(n.price?.micros ?? 0n)}
              </span>
            </div>
          ))}
        </div>
      </details>
      <div className={styles.tot}>
        <span>Total</span>
        <span>{formatUsdc(s.total)}</span>
      </div>
      <div className={styles.fee}>
        Includes a {formatUsdc(s.fee)} booking fee
      </div>
    </div>
  );
}
