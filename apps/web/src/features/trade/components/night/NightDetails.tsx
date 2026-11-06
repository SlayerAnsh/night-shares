import type { GetNightResponse } from "@night-shares/proto/market/v1/market_pb";
import Link from "next/link";
import { formatRoomNights } from "../../../../shared/format";
import { money, nightHref, percent, riskName } from "../../model/market";
export function NightDetails({ detail }: { detail: GetNightResponse }) {
  const s = detail.stats,
    t = detail.hostTrackRecord;
  return (
    <>
      {s && (
        <section>
          <h2>Night stats</h2>
          <dl>
            <dt>Annualized return</dt>
            <dd>{percent(s.annualizedReturnBps)}</dd>
            <dt>Price swings</dt>
            <dd>{percent(s.volatilityBps)}</dd>
            <dt>Sell through</dt>
            <dd>{percent(s.sellThroughBps)}</dd>
            <dt>Expected exit</dt>
            <dd>{money(s.expectedExit)}</dd>
            <dt>Worst refund</dt>
            <dd>{money(s.worstRefund)}</dd>
            <dt>Buy liquidity</dt>
            <dd>{formatRoomNights(s.buyLiquidity?.tenths ?? 0)}</dd>
            <dt>Sell liquidity</dt>
            <dd>{formatRoomNights(s.sellLiquidity?.tenths ?? 0)}</dd>
          </dl>
        </section>
      )}
      <section>
        <h2>Price history</h2>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {detail.priceHistory.map((point) => (
              <tr key={`${point.at?.seconds}-${point.at?.nanos}`}>
                <td>
                  {point.at
                    ? new Date(Number(point.at.seconds) * 1000).toISOString()
                    : "Unavailable"}
                </td>
                <td>{money(point.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!detail.priceHistory.length && <p>No price history yet.</p>}
      </section>
      {t && (
        <section>
          <h2>Host track record</h2>
          <dl>
            {Object.entries({
              "Nights traded": t.nightsTraded,
              Booked: percent(t.bookedBps),
              Unsold: percent(t.unsoldBps),
              "Average return": percent(t.averageReturnBps),
              Profitable: percent(t.profitableBps),
              Refund: percent(t.refundBps),
              Honoured: percent(t.honouredBps),
              Incidents: t.incidents,
            }).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <section>
        <h2>Month calendar</h2>
        {Array.from(
          new Set(detail.monthCalendar.map((card) => card.night?.roomTypeId)),
        ).map((room) => (
          <table key={room}>
            <caption>
              {
                detail.monthCalendar.find(
                  (card) => card.night?.roomTypeId === room,
                )?.roomTypeName
              }
            </caption>
            <thead>
              <tr>
                <th>Night</th>
                <th>Price</th>
                <th>Fair price</th>
                <th>Est. return</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {detail.monthCalendar
                .filter((card) => card.night?.roomTypeId === room)
                .map(
                  (card) =>
                    card.night && (
                      <tr key={nightHref(card.night)}>
                        <td>
                          <Link href={nightHref(card.night)}>
                            {card.night.date}
                          </Link>
                        </td>
                        <td>{money(card.price)}</td>
                        <td>{money(card.fairPrice)}</td>
                        <td>{percent(card.estimatedReturnBps)}</td>
                        <td>{riskName(card.risk)}</td>
                      </tr>
                    ),
                )}
            </tbody>
          </table>
        ))}
      </section>
    </>
  );
}
