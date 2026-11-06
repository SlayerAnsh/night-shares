import type { NightKey } from "@night-shares/proto/common/v1/night_pb";
import type { NightCard } from "@night-shares/proto/market/v1/analytics_pb";
import Link from "next/link";
import {
  fairDelta,
  fairText,
  fairTone,
  signedPercent,
  tone,
  usd,
} from "../../model/display";
import { nightHref } from "../../model/market";
import text from "../ui/text.module.css";
import styles from "./calendar.module.css";

// Other room types at this hotel on the same night. Each is its own market.
export function OtherMarkets({
  night,
  cards,
}: {
  night: Pick<NightKey, "propertyId" | "roomTypeId" | "date">;
  cards: NightCard[];
}) {
  const others = cards.filter(
    (card) =>
      card.night?.date === night.date &&
      card.night.roomTypeId !== night.roomTypeId,
  );
  if (!others.length) return null;
  return (
    <div className={styles.om}>
      <h3>
        Other markets at this hotel{" "}
        <span className={styles.omSub}>same night</span>
      </h3>
      {others.map((card) => {
        if (!card.night) return null;
        const delta = fairDelta(card.price?.micros, card.fairPrice?.micros);
        return (
          <Link
            key={nightHref(card.night)}
            href={nightHref(card.night)}
            className={styles.omRow}
          >
            <b>{card.roomTypeName}</b>
            <span className={text.num}>
              {usd(card.price?.micros)} <i>price</i>
            </span>
            <span className={`${text.num} ${text[tone(card.changeBps, 4)]}`}>
              {signedPercent(card.changeBps)} <i>24h</i>
            </span>
            <span className={`${text.num} ${text[fairTone(delta)]}`}>
              {fairText(delta)} <i>ask vs fair</i>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
