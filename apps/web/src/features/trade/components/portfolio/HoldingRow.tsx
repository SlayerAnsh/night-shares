"use client";
import type { Ask } from "@night-shares/proto/market/v1/book_pb";
import type { Holding } from "@night-shares/proto/market/v1/portfolio_pb";
import Link from "next/link";
import { formatRoomNights } from "../../../../shared/format";
import { useHolding } from "../../hooks/use-holding";
import {
  shortDate,
  signedPercent,
  signedUsd,
  tone,
  usd,
} from "../../model/display";
import { nightHref } from "../../model/market";
import { Sparkline } from "../charts/Sparkline";
import { Risk } from "../shared/Risk";
import text from "../ui/text.module.css";
import styles from "./portfolio.module.css";

export function HoldingRow({
  holding: h,
  listings,
}: {
  holding: Holding;
  listings: Ask[];
}) {
  const { detail, card, listed } = useHolding(h, listings);
  if (!h.night) return null;
  const pnl = h.unrealisedPnl?.micros ?? 0n;
  const history = (detail.data?.priceHistory ?? [])
    .slice(-8)
    .map((point) => Number(point.price?.micros ?? 0n));
  return (
    <Link href={nightHref(h.night)} className={styles.row}>
      <span className={styles.mkt}>
        <span className={styles.name}>
          <b>{card?.propertyName ?? h.night.propertyId}</b>
          <span>
            {card?.roomTypeName ?? h.night.roomTypeId},{" "}
            {shortDate(h.night.date)}
          </span>
          {detail.error && (
            <span className={text.neg} role="alert">
              {detail.error.message}
            </span>
          )}
        </span>
        <Sparkline values={history} />
      </span>
      <span className={text.num}>
        <i className={styles.lab}>Held </i>
        {formatRoomNights(h.size?.tenths ?? 0)}
      </span>
      <span className={text.num}>
        <i className={styles.lab}>Avg cost </i>
        {usd(h.averageCost?.micros)}
      </span>
      <span className={`${text.num} ${styles.value}`}>
        {usd(h.value?.micros)}
      </span>
      <span className={`${text.num} ${text[tone(pnl, 500000)]}`}>
        <i className={styles.lab}>P&amp;L </i>
        {signedUsd(pnl)}
      </span>
      <span
        className={`${text.num} ${card ? text[tone(card.estimatedReturnBps)] : ""}`}
      >
        {card ? signedPercent(card.estimatedReturnBps) : "n/a"}
      </span>
      <span>{card ? <Risk risk={card.risk} /> : "n/a"}</span>
      <span className={listed ? text.num : text.muted}>
        {listed ? `${formatRoomNights(listed)} rn` : "Not listed"}
      </span>
      <span className={text.num}>{usd(h.unsoldRefund?.micros)}</span>
    </Link>
  );
}
