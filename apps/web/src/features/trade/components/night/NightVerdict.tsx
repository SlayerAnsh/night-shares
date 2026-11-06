import type { NightCard } from "@night-shares/proto/market/v1/analytics_pb";
import type { GetNightResponse } from "@night-shares/proto/market/v1/market_pb";
import { fairDelta, signedPercent, usd } from "../../model/display";
import styles from "./night.module.css";

// One plain sentence under the header: where the price sits and what it may be worth.
export function NightVerdict({
  card,
  detail,
}: {
  card: NightCard;
  detail?: GetNightResponse;
}) {
  const delta = fairDelta(card.price?.micros, card.fairPrice?.micros);
  const fair = usd(card.fairPrice?.micros);
  const where =
    delta === null
      ? "has no predicted fair price yet"
      : Math.abs(delta) < 0.02
        ? `is close to the predicted fair price of ${fair}`
        : `is ${Math.round(Math.abs(delta) * 100)}% ${delta < 0 ? "below" : "above"} the predicted fair price of ${fair}`;
  const exit = detail?.stats?.expectedExit;
  return (
    <p className={styles.verdict}>
      Price {usd(card.price?.micros)} {where}.
      {exit &&
        ` If it sells like similar nights it is worth about ${usd(exit.micros)} at release, ${signedPercent(card.estimatedReturnBps)} after fees.`}
    </p>
  );
}
