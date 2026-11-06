import type { TapePrint } from "@night-shares/proto/market/v1/analytics_pb";
import type { GetBookResponse } from "@night-shares/proto/market/v1/market_pb";
import { formatRoomNights } from "../../../../shared/format";
import { money, percent, sourceName } from "../../model/market";
export function OrderBook({
  book,
  prints,
}: {
  book: GetBookResponse;
  prints: TapePrint[];
}) {
  return (
    <section>
      <h2>Order book</h2>
      <p>
        Fair price marker: {money(book.fairPrice)} · Recall cap:{" "}
        {money(book.recallCap)} · Late fee: {percent(book.lateFeeBps)}
      </p>
      {(
        [
          ["Asks", book.asks],
          ["Bids", book.bids],
        ] as const
      ).map(([label, rows]) => (
        <table key={label}>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th>Price</th>
              <th>Room nights</th>
              <th>Source</th>
              <th>Net after late fee</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.askId}-${row.source}-${row.price?.micros}`}>
                <td>
                  {money(row.price)}
                  {row.price?.micros === book.fairPrice?.micros
                    ? " · Fair"
                    : ""}
                </td>
                <td>{formatRoomNights(row.size?.tenths ?? 0)}</td>
                <td>{sourceName(row.source)}</td>
                <td>{label === "Bids" ? money(row.net) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      <h2>Holders</h2>
      <ul>
        {book.holders.map((holder) => (
          <li key={holder.walletAddress}>
            {holder.walletAddress}
            {holder.isHost ? " (Host)" : ""}:{" "}
            {formatRoomNights(holder.size?.tenths ?? 0)}
          </li>
        ))}
      </ul>
      <p>
        Each human may hold up to 30% of this night. Guests can recall holdings
        at the recall cap.
      </p>
      <h2>Last prints</h2>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Actor</th>
            <th>Side</th>
            <th>Price</th>
            <th>Room nights</th>
          </tr>
        </thead>
        <tbody>
          {prints.map((print) => (
            <tr key={print.id}>
              <td>
                {print.at
                  ? new Date(Number(print.at.seconds) * 1000).toISOString()
                  : "—"}
              </td>
              <td>
                {
                  ["Unknown", "Guest", "Trader", "You", "Sell-back", "Agent"][
                    print.actor
                  ]
                }
              </td>
              <td>{print.side === 1 ? "Buy" : "Sell"}</td>
              <td>{money(print.price)}</td>
              <td>{formatRoomNights(print.size?.tenths ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!prints.length && <p>No trades yet.</p>}
    </section>
  );
}
