import type { NightCard } from "@night-shares/proto/market/v1/analytics_pb";
import type { GetBookResponse } from "@night-shares/proto/market/v1/market_pb";
import {
  fairDelta,
  fairText,
  fairTone,
  hoursUntil,
  releaseLong,
  shortDate,
  signedPercent,
  tone,
  usd,
  weekdayDate,
} from "../../model/display";
import { StarIcon } from "../shared/Icons";
import { Risk } from "../shared/Risk";
import { Kpis } from "../ui/Kpis";
import styles from "./night.module.css";

// Title, watch toggle and the stat strip at the top of a market.
export function NightHeader({
  card,
  date,
  book,
  watched,
  watchPending,
  onWatch,
}: {
  card: NightCard;
  date: string;
  book?: GetBookResponse;
  watched: boolean;
  watchPending: boolean;
  onWatch: () => void;
}) {
  const ask = book?.asks[0];
  const bid = book?.bids[0];
  const delta = fairDelta(card.price?.micros, card.fairPrice?.micros);
  const askDelta = fairDelta(ask?.price?.micros, card.fairPrice?.micros);
  const hours = hoursUntil(card.releaseAt?.seconds, Date.now());
  return (
    <header className={styles.strip}>
      <div>
        <h1 className={styles.title}>
          <b>{card.propertyName}</b> {card.roomTypeName}
        </h1>
        <p className={styles.hotel}>
          {card.city} <span aria-hidden="true">·</span> {weekdayDate(date)},{" "}
          {date.slice(0, 4)}
          <button
            type="button"
            className={`${styles.watch} ${watched ? styles.watchOn : ""}`}
            aria-pressed={watched}
            disabled={watchPending}
            onClick={onWatch}
          >
            <StarIcon />
            <span>{watched ? "Watching" : "Watch"}</span>
          </button>
        </p>
      </div>
      <Kpis
        label="Market figures"
        items={[
          { label: "Price", value: usd(card.price?.micros), big: true },
          {
            label: "Best ask",
            value: book ? (ask ? usd(ask.price?.micros) : "Sold out") : "…",
          },
          {
            label: "Best bid, net",
            value: book ? usd((bid?.net ?? bid?.price)?.micros) : "…",
          },
          {
            label: "24h",
            value: signedPercent(card.changeBps),
            tone: tone(card.changeBps, 4),
          },
          {
            label: `vs fair ${usd(card.fairPrice?.micros)}`,
            value: fairText(delta),
            tone: fairTone(delta),
            sub: askDelta === null ? undefined : `ask ${fairText(askDelta)}`,
          },
          {
            label: "Est. return",
            value: signedPercent(card.estimatedReturnBps),
            tone: tone(card.estimatedReturnBps),
            sub: "at best ask",
          },
          { label: "Risk", value: <Risk risk={card.risk} /> },
          {
            label: "Release in",
            value: releaseLong(hours),
            sub: card.releaseAt
              ? shortDate(
                  new Date(Number(card.releaseAt.seconds) * 1000)
                    .toISOString()
                    .slice(0, 10),
                )
              : undefined,
          },
        ]}
      />
    </header>
  );
}
