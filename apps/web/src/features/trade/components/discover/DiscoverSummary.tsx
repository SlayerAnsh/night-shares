import type { NightCard } from "@night-shares/proto/market/v1/analytics_pb";
import { fairDelta, median, signedPercent, tone } from "../../model/display";
import text from "../ui/text.module.css";
import styles from "./discover.module.css";

export function DiscoverSummary({ nights }: { nights: NightCard[] }) {
  const below = nights.filter(
    (card) =>
      (fairDelta(card.price?.micros, card.fairPrice?.micros) ?? 0) <= -0.02,
  ).length;
  const mid = median(nights.map((card) => card.estimatedReturnBps));
  return (
    <div className={styles.meta}>
      <p>
        <b className={text.num}>{nights.length}</b>{" "}
        {nights.length === 1 ? "market" : "markets"}
        <span aria-hidden="true"> · </span>
        <b className={text.num}>{below}</b> asks below fair
        {mid !== null && (
          <>
            <span aria-hidden="true"> · </span>median est. return{" "}
            <b className={`${text.num} ${text[tone(mid)]}`}>
              {signedPercent(Math.round(mid), 0)}
            </b>
          </>
        )}
      </p>
      <span>Est. return is to release, after fees.</span>
    </div>
  );
}
