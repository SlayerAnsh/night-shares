import type { NightCard } from "@night-shares/proto/market/v1/analytics_pb";
import Link from "next/link";
import { shortDate, type Tone, usd } from "../../model/display";
import { nightHref } from "../../model/market";
import text from "../ui/text.module.css";
import styles from "./discover.module.css";

export function MoverRows({
  nights,
  figure,
}: {
  nights: NightCard[];
  figure: (card: NightCard) => { text: string; tone: Tone };
}) {
  return (
    <div className={styles.mv}>
      {nights.map((card) => {
        if (!card.night) return null;
        const fig = figure(card);
        return (
          <Link
            key={nightHref(card.night)}
            className={styles.mvRow}
            href={nightHref(card.night)}
          >
            <span className={styles.mvName}>
              <b>{card.propertyName}</b>
              <small>{card.roomTypeName}</small>
            </span>
            <span className={styles.mvDate}>{shortDate(card.night.date)}</span>
            <span className={text.num}>{usd(card.price?.micros)}</span>
            <span className={`${text.num} ${text[fig.tone]}`}>{fig.text}</span>
          </Link>
        );
      })}
    </div>
  );
}
