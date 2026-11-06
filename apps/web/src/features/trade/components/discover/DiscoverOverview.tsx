"use client";
import type { NightCard } from "@night-shares/proto/market/v1/analytics_pb";
import { useState } from "react";
import {
  fairDelta,
  fairText,
  hoursUntil,
  median,
  signedPercent,
  tone,
} from "../../model/display";
import { Kpis } from "../ui/Kpis";
import { Segmented } from "../ui/Segmented";
import { Skeleton } from "../ui/Skeleton";
import styles from "./discover.module.css";
import { MoverRows } from "./MoverRows";

type Movers = "up" | "down";
const SOON_HOURS = 14 * 24;

// Exchange overview: four figures, then top movers and best value side by side.
export function DiscoverOverview({
  nights,
  loading,
}: {
  nights: NightCard[];
  loading: boolean;
}) {
  const [movers, setMovers] = useState<Movers>("up");
  if (loading)
    return (
      <div className={styles.over}>
        <Skeleton rows={3} label="Loading the exchange overview" height={64} />
      </div>
    );
  if (!nights.length) return null;
  const now = Date.now();
  const delta = (card: NightCard) =>
    fairDelta(card.price?.micros, card.fairPrice?.micros);
  const below = nights.filter((card) => (delta(card) ?? 0) <= -0.02).length;
  const soon = nights.filter(
    (card) =>
      (hoursUntil(card.releaseAt?.seconds, now) ?? Infinity) <= SOON_HOURS,
  ).length;
  const mid = median(nights.map((card) => card.estimatedReturnBps)) ?? 0;
  const byChange = [...nights].sort((a, b) =>
    movers === "up" ? b.changeBps - a.changeBps : a.changeBps - b.changeBps,
  );
  const byValue = [...nights]
    .filter((card) => delta(card) !== null)
    .sort((a, b) => (delta(a) ?? 0) - (delta(b) ?? 0));
  return (
    <div className={styles.over}>
      <Kpis
        variant="large"
        label="Exchange overview"
        items={[
          { label: "Open markets", value: nights.length },
          {
            label: "Asks below fair",
            value: below,
            sub: `of ${nights.length}`,
          },
          {
            label: "Median est. return",
            value: signedPercent(Math.round(mid), 1),
            tone: tone(mid),
          },
          { label: "Release in 14 days", value: soon, sub: "markets" },
        ]}
      />
      <div className={styles.overRow}>
        <section aria-labelledby="h-mv">
          <div className={styles.panelHead}>
            <h2 id="h-mv">Top movers 24h</h2>
            <Segmented
              variant="small"
              label="Show"
              value={movers}
              onChange={setMovers}
              options={[
                { value: "up", label: "Gainers" },
                { value: "down", label: "Losers" },
              ]}
            />
          </div>
          <MoverRows
            nights={byChange.slice(0, 5)}
            figure={(card) => ({
              text: signedPercent(card.changeBps),
              tone: tone(card.changeBps, 4),
            })}
          />
        </section>
        <section aria-labelledby="h-bv">
          <div className={styles.panelHead}>
            <h2 id="h-bv">Best value</h2>
            <span>Ask vs predicted fair price</span>
          </div>
          <MoverRows
            nights={byValue.slice(0, 5)}
            figure={(card) => ({
              text: fairText(delta(card)),
              tone: (delta(card) ?? 0) <= -0.02 ? "pos" : "flat",
            })}
          />
        </section>
      </div>
    </div>
  );
}
