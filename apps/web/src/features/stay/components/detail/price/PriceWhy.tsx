import type { StayQuote } from "@night-shares/proto/stay/v1/trip_pb";
import { formatUsdc } from "../../../../../shared/format";
import { plural } from "../../../model/dates";
import { summarizeQuote } from "../../../model/quote";
import styles from "./Price.module.css";

// "Where this price comes from", in plain words (.g-why). Splits the stay
// total by where each night was bought.
export function PriceWhy({
  quote,
  roomName,
}: {
  quote?: StayQuote;
  roomName: string;
}) {
  const s = quote && summarizeQuote(quote);
  return (
    <details className={styles.why}>
      <summary>Where this price comes from</summary>
      <div className={styles.whyBody}>
        {!s ? (
          <p>
            Each night is priced from the cheapest of three places: the hotel's
            own price for that night, a traveller reselling a night they no
            longer need, or a capped price. If those run out, a room is taken
            back from a trader at the capped price, so guests come first. The
            price never goes past the cap. Pick dates to see the split for your
            stay.
          </p>
        ) : (
          <>
            <p>
              We pick the cheapest price for each night of your stay,{" "}
              {plural(s.nights, "night")} for {roomName}.
            </p>
            <Row
              title="Hotel price"
              sub="The hotel's own rate for these nights"
              value={s.hotel}
            />
            <Row
              title="Traveller resale"
              sub="Nights other travellers are selling at a lower price"
              value={s.trader}
            />
            <Row
              title="Capped price"
              sub="A room taken back from a trader for you, never more than the cap"
              value={s.recall}
            />
            <div className={`${styles.whyRow} ${styles.whyTot}`}>
              <b>Your price</b>
              <span className={styles.mono}>{formatUsdc(s.total)}</span>
            </div>
          </>
        )}
      </div>
    </details>
  );
}

function Row({
  title,
  sub,
  value,
}: {
  title: string;
  sub: string;
  value: bigint;
}) {
  if (value <= 0n) return null;
  return (
    <div className={styles.whyRow}>
      <div>
        <b>{title}</b>
        <span>{sub}</span>
      </div>
      <span className={styles.mono}>{formatUsdc(value)}</span>
    </div>
  );
}
