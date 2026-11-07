import type { NightCard } from "@night-shares/proto/market/v1/analytics_pb";
import Link from "next/link";
import {
  fairDelta,
  fairText,
  fairTone,
  forecastReturn,
  hoursUntil,
  releaseShort,
  signedPercent,
  tone,
  usd,
  weekdayDate,
} from "../../model/display";
import { nightHref } from "../../model/market";
import text from "../ui/text.module.css";
import styles from "./market-table.module.css";
import { Risk } from "./Risk";

export function MarketRow({ card, now }: { card: NightCard; now: number }) {
  if (!card.night) return null;
  const delta = fairDelta(card.price?.micros, card.fairPrice?.micros);
  const date = weekdayDate(card.night.date);
  return (
    <div className={styles.row}>
      <Link
        className={styles.link}
        href={nightHref(card.night)}
        aria-label={`${card.propertyName}, ${card.roomTypeName}, ${date}. Price ${usd(card.price?.micros)}, est. return ${signedPercent(forecastReturn(card))}`}
      >
        <span className={styles.mkt}>
          <b>{card.propertyName}</b>
          <span>
            {card.roomTypeName}, {card.city}
          </span>
        </span>
        <span className={styles.date}>{date}</span>
        <span className={`${styles.price} ${text.num}`}>
          {usd(card.price?.micros)}
          <small>fair {usd(card.fairPrice?.micros)}</small>
        </span>
        <span
          className={`${styles.chg} ${text.num} ${text[tone(card.changeBps, 4)]}`}
        >
          <i className={styles.lab}>24h </i>
          {signedPercent(card.fairPrice ? card.changeBps : undefined)}
        </span>
        <span className={`${styles.fair} ${text.num} ${text[fairTone(delta)]}`}>
          <i className={styles.lab}>Ask vs fair </i>
          {fairText(delta)}
        </span>
        <span
          className={`${styles.ret} ${text.num} ${text[tone(card.estimatedReturnBps)]}`}
        >
          <i className={styles.lab}>Est. return </i>
          {signedPercent(forecastReturn(card))}
        </span>
        <span className={styles.risk}>
          <Risk risk={card.risk} />
        </span>
        <span className={`${styles.rel} ${text.num}`}>
          {releaseShort(hoursUntil(card.releaseAt?.seconds, now))}
        </span>
      </Link>
    </div>
  );
}
