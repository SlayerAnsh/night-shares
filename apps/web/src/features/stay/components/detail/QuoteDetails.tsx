import type { StayQuote } from "@night-shares/proto/stay/v1/trip_pb";
import { formatUsdc } from "../../../../shared/format";
export function QuoteDetails({ quote }: { quote: StayQuote }) {
  return (
    <section>
      <p>
        Total {formatUsdc(quote.total?.micros ?? 0n)} · Fee{" "}
        {formatUsdc(quote.fee?.micros ?? 0n)}
      </p>
      <details>
        <summary>Where this price comes from</summary>
        <p>Usual rate {formatUsdc(quote.usualRate?.micros ?? 0n)}</p>
        <p>
          Hotel: rooms offered by the hotel. Trader: rooms offered by a holder.
          Recall cap: the capped guest price.
        </p>
        <table>
          <thead>
            <tr>
              <th>Night</th>
              <th>Price</th>
              <th>Source</th>
              <th>Usual rate</th>
            </tr>
          </thead>
          <tbody>
            {quote.nights.map((n) => (
              <tr key={n.date}>
                <td>{n.date}</td>
                <td>{formatUsdc(n.price?.micros ?? 0n)}</td>
                <td>
                  {["Unknown", "Hotel", "Trader", "Recall cap"][n.source]}
                </td>
                <td>{formatUsdc(n.usualRate?.micros ?? 0n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
