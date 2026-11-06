import type { RouteQuote } from "@night-shares/proto/market/v1/book_pb";
import { formatRoomNights } from "../../../../shared/format";
import { money, sourceName } from "../../model/market";
export function QuotePreview({
  quote: q,
  mode,
}: {
  quote: RouteQuote;
  mode: string;
}) {
  return (
    <>
      <dl>
        <dt>Filled / requested room nights</dt>
        <dd>
          {formatRoomNights(q.filled?.tenths ?? 0)} /{" "}
          {formatRoomNights(q.requested?.tenths ?? 0)}
        </dd>
        <dt>Average</dt>
        <dd>{money(q.average)}</dd>
        <dt>Gross</dt>
        <dd>{money(q.gross)}</dd>
        <dt>Fee</dt>
        <dd>{money(q.fee)}</dd>
        <dt>
          {mode === "sell" ? "Net proceeds (minimum)" : "Total (maximum)"}
        </dt>
        <dd>{money(q.total)}</dd>
        <dt>Limit used / cap</dt>
        <dd>
          {formatRoomNights(q.capUsed?.tenths ?? 0)} /{" "}
          {formatRoomNights(q.cap?.tenths ?? 0)}
        </dd>
        <dt>Late fee</dt>
        <dd>{money(q.lateFee)}</dd>
        <dt>Refund if unsold</dt>
        <dd>{money(q.unsoldRefund)}</dd>
      </dl>
      {(q.filled?.tenths ?? 0) < (q.requested?.tenths ?? 0) && (
        <p role="note">
          Only part of this size can fill. Review the filled amount before
          trading.
        </p>
      )}
      <table>
        <caption>Route preview</caption>
        <thead>
          <tr>
            <th>Source</th>
            <th>Price</th>
            <th>Room nights</th>
          </tr>
        </thead>
        <tbody>
          {q.fills.map((fill) => (
            <tr key={`${fill.askId}-${fill.source}-${fill.price?.micros}`}>
              <td>{sourceName(fill.source)}</td>
              <td>{money(fill.price)}</td>
              <td>{formatRoomNights(fill.size?.tenths ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
