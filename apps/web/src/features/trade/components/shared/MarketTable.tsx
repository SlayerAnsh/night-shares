"use client";
import type { NightCard } from "@night-shares/proto/market/v1/analytics_pb";
import { useState } from "react";
import { Empty } from "../ui/Empty";
import { MarketRow } from "./MarketRow";
import styles from "./market-table.module.css";

const PAGE = 40;

export type MarketSort = "return" | "risk";

const COLUMNS = [
  ["mkt", "Market"],
  ["date", "Night"],
  ["price", "Price"],
  ["chg", "24h"],
  ["fair", "Ask vs fair"],
  ["ret", "Est. return"],
  ["risk", "Risk"],
  ["rel", "Release"],
] as const;

// Markets as a calm table: one row per room type and night.
export function MarketTable({
  nights,
  sort,
  onSort,
  empty = "Nothing matches these filters.",
}: {
  nights: NightCard[];
  sort?: MarketSort;
  onSort?: (sort: MarketSort) => void;
  empty?: string;
}) {
  const now = Date.now();
  const [limit, setLimit] = useState(PAGE);
  const shown = nights.slice(0, limit);
  const more = Math.min(PAGE, nights.length - shown.length);
  return (
    <div>
      <div className={styles.head} hidden={!nights.length}>
        {COLUMNS.map(([key, title]) => {
          const sortable = onSort && (key === "ret" || key === "risk");
          const value: MarketSort = key === "risk" ? "risk" : "return";
          const on = sortable && sort === value;
          return (
            <span key={key} className={styles[key]}>
              {sortable ? (
                <button
                  type="button"
                  className={on ? styles.on : undefined}
                  onClick={() => onSort(value)}
                >
                  {title}
                  <i className={styles.arrow} aria-hidden="true">
                    {on ? "▼" : ""}
                  </i>
                </button>
              ) : (
                title
              )}
            </span>
          );
        })}
      </div>
      {nights.length ? (
        shown.map((card) => (
          <MarketRow
            key={
              card.night
                ? `${card.night.propertyId}:${card.night.roomTypeId}:${card.night.date}`
                : card.propertyName
            }
            card={card}
            now={now}
          />
        ))
      ) : (
        <Empty>{empty}</Empty>
      )}
      {more > 0 && (
        <button
          type="button"
          className={styles.more}
          onClick={() => setLimit(limit + PAGE)}
        >
          Show {more} more
        </button>
      )}
    </div>
  );
}
