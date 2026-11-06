"use client";
import type {
  GetBookResponse,
  GetNightResponse,
  ListTapeResponse,
} from "@night-shares/proto/market/v1/market_pb";
import type { UseQueryResult } from "@tanstack/react-query";
import { useState } from "react";
import chart from "../charts/chart.module.css";
import { PriceChart } from "../charts/PriceChart";
import { Feedback } from "../shared/Feedback";
import { Segmented } from "../ui/Segmented";
import { Skeleton } from "../ui/Skeleton";
import styles from "./night.module.css";
import { OrderBook } from "./OrderBook";
import { Tape } from "./Tape";

type Query<T> = Pick<UseQueryResult<T, Error>, "data" | "error" | "isPending">;

// Chart across the top, then the order book and recent trades side by side.
export function NightMarket({
  detail,
  book,
  tape,
  fair,
  onPick,
}: {
  detail?: GetNightResponse;
  book: Query<GetBookResponse>;
  tape: Query<ListTapeResponse>;
  fair?: bigint;
  onPick: (mode: "buy" | "sell", tenths: number) => void;
}) {
  const [show, setShow] = useState<"book" | "trades">("book");
  const points = (detail?.priceHistory ?? []).map((p) => ({
    at: Number(p.at?.seconds ?? 0n) * 1000,
    value: Number(p.price?.micros ?? 0n) / 1e6,
  }));
  return (
    <div className={styles.mkt} data-show={show}>
      <section className={styles.chartC} aria-labelledby="h-ch">
        <div className={styles.mkHd}>
          <h2 id="h-ch">Price and predicted fair price</h2>
          <span>{points.length ? `${points.length} points` : ""}</span>
        </div>
        {!detail ? (
          <Skeleton rows={1} height={300} label="Loading price history" />
        ) : points.length ? (
          <PriceChart
            className={styles.chartBox}
            points={points}
            reference={fair === undefined ? undefined : Number(fair) / 1e6}
            label="Price history with the predicted fair price"
          />
        ) : (
          <div className={`${chart.empty} ${styles.chartEmpty}`}>
            No price history yet.
          </div>
        )}
      </section>
      <div className={styles.btToggle}>
        <Segmented
          variant="wide"
          label="Show order book or recent trades"
          value={show}
          onChange={setShow}
          options={[
            { value: "book", label: "Book" },
            { value: "trades", label: "Trades" },
          ]}
        />
      </div>
      <section className={styles.bookC} aria-labelledby="h-bk">
        <div className={styles.mkHd}>
          <h2 id="h-bk">Order book</h2>
          <span>Pick a level to fill the order box</span>
        </div>
        <Feedback error={book.error?.message} />
        {book.isPending && (
          <Skeleton rows={10} height={24} label="Loading the book" />
        )}
        {book.data && <OrderBook book={book.data} onPick={onPick} />}
      </section>
      <section className={styles.tapeC} aria-labelledby="h-tp">
        <div className={styles.mkHd}>
          <h2 id="h-tp">Recent trades</h2>
          <span>Newest first</span>
        </div>
        <Feedback error={tape.error?.message} />
        {tape.isPending && (
          <Skeleton rows={10} height={24} label="Loading trades" />
        )}
        {tape.data && <Tape prints={tape.data.prints} />}
      </section>
    </div>
  );
}
