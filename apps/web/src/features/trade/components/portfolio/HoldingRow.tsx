"use client";
import type { Ask } from "@night-shares/proto/market/v1/book_pb";
import type { Holding } from "@night-shares/proto/market/v1/portfolio_pb";
import Link from "next/link";
import { formatRoomNights } from "../../../../shared/format";
import { useHolding } from "../../hooks/use-holding";
import { money, nightHref, percent, riskName } from "../../model/market";
export function HoldingRow({
  holding: h,
  listings,
}: {
  holding: Holding;
  listings: Ask[];
}) {
  const { detail, card, listed } = useHolding(h, listings);
  return (
    <tr>
      <td>
        {h.night && (
          <Link href={nightHref(h.night)}>
            {card
              ? `${card.propertyName} · ${card.roomTypeName}`
              : h.night.roomTypeId}{" "}
            · {h.night.date}
          </Link>
        )}
        {detail.error && <p role="alert">{detail.error.message}</p>}
      </td>
      <td>{formatRoomNights(h.size?.tenths ?? 0)}</td>
      <td>{money(h.averageCost)}</td>
      <td>{money(h.value)}</td>
      <td>{money(h.unrealisedPnl)}</td>
      <td>{card ? percent(card.estimatedReturnBps) : "Unavailable"}</td>
      <td>{card ? riskName(card.risk) : "Unavailable"}</td>
      <td>{formatRoomNights(listed)}</td>
      <td>
        {money(h.unsoldRefund)}
        <small>If unsold at cutoff: 70% of the average bid</small>
      </td>
    </tr>
  );
}
