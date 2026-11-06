import type { NightCard } from "@night-shares/proto/market/v1/analytics_pb";
import Link from "next/link";
import {
  daysOut,
  money,
  nightHref,
  percent,
  riskName,
} from "../../model/market";
export function NightCards({ nights }: { nights: NightCard[] }) {
  if (!nights.length) return <p>No nights match these filters.</p>;
  return (
    <ul>
      {nights.map((card) => (
        <li key={card.night ? nightHref(card.night) : card.propertyName}>
          {card.night && (
            <Link href={nightHref(card.night)}>
              {card.propertyName} · {card.roomTypeName} · {card.night.date}
            </Link>
          )}
          <p>
            {card.city} · Price {money(card.price)} · Fair price{" "}
            {money(card.fairPrice)} · Est. return{" "}
            {percent(card.estimatedReturnBps)} · Risk {riskName(card.risk)} ·{" "}
            {card.night ? daysOut(card.night.date, Date.now()) : "—"} days out
          </p>
        </li>
      ))}
    </ul>
  );
}
