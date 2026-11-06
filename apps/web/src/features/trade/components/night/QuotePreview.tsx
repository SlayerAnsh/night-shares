import type { RouteQuote } from "@night-shares/proto/market/v1/book_pb";
import { formatRoomNights } from "../../../../shared/format";
import { usd } from "../../model/display";
import { sourceName } from "../../model/market";
import { CheckIcon } from "../shared/Icons";
import styles from "./ticket.module.css";

const rn = (tenths?: number) => formatRoomNights(tenths ?? 0);

// The quote as short info lines, with the route folded away.
export function QuotePreview({
  quote: q,
  mode,
}: {
  quote: RouteQuote;
  mode: string;
}) {
  const isSell = mode === "sell";
  const partial = (q.filled?.tenths ?? 0) < (q.requested?.tenths ?? 0);
  const lateFee = q.lateFee?.micros ?? 0n;
  return (
    <>
      <ul className={styles.lines}>
        {partial && (
          <li className={styles.warn} role="note">
            Only {rn(q.filled?.tenths)} of {rn(q.requested?.tenths)} room nights
            can fill. Review the filled amount before trading.
          </li>
        )}
        <li>
          {isSell ? "You get at least " : "You pay at most "}
          <b>{usd(q.total?.micros, 2)}</b> after the {usd(q.fee?.micros, 2)} fee
        </li>
        <li>
          <span className={styles.wid}>
            <CheckIcon />
          </span>
          World ID limit: <b>{rn(q.capUsed?.tenths)}</b> used of{" "}
          <b>{rn(q.cap?.tenths)}</b> room nights
        </li>
        <li>
          If unsold at cutoff you get <b>{usd(q.unsoldRefund?.micros, 2)}</b>{" "}
          back
          <small>
            70% of the average bid, paid on every unsold room night.
          </small>
        </li>
        {lateFee > 0n && (
          <li className={styles.late} role="note">
            <b>Release is close.</b> The late fee on this trade is{" "}
            <b>{usd(lateFee, 2)}</b>.
          </li>
        )}
      </ul>
      <details className={styles.more}>
        <summary>Route for this {isSell ? "sale" : "buy"}</summary>
        <div className={styles.route}>
          <div className={styles.kv}>
            <span>Filled</span>
            <b>
              {rn(q.filled?.tenths)} of {rn(q.requested?.tenths)} room nights
            </b>
          </div>
          {q.fills.map((fill) => (
            <div
              key={`${fill.askId}-${fill.source}-${fill.price?.micros}`}
              className={styles.kv}
            >
              <span>{sourceName(fill.source)}</span>
              <b>
                {rn(fill.size?.tenths)} at {usd(fill.price?.micros, 2)}
              </b>
            </div>
          ))}
          <div className={styles.kv}>
            <span>Average price</span>
            <b>{usd(q.average?.micros, 2)}</b>
          </div>
          <div className={styles.kv}>
            <span>Gross</span>
            <b>{usd(q.gross?.micros, 2)}</b>
          </div>
          <div className={styles.kv}>
            <span>Fee</span>
            <b>{usd(q.fee?.micros, 2)}</b>
          </div>
        </div>
      </details>
    </>
  );
}
