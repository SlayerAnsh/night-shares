import { cx } from "@night-shares/design-system";
import type { HostNight } from "@night-shares/proto/host/v1/hotel_pb";
import Link from "next/link";
import { formatRoomNights } from "../../../../shared/format";
import { shortInstant } from "../../model/calendar";
import { premium } from "../../model/day-summary";
import { usd } from "../../model/money";
import { StackBar, Swatch } from "../ui/StackBar";
import ui from "../ui/ui.module.css";
import styles from "./Rooms.module.css";

export const DEMAND: Record<number, string> = {
  1: "Calm",
  2: "Normal",
  3: "Peak",
};

export function tradeHref(row: HostNight) {
  const n = row.night;
  return n
    ? `/trade/${encodeURIComponent(`${n.propertyId}:${n.roomTypeId}:${n.date}`)}`
    : "/trade";
}

/** One room type on one night: what sells now, where the rooms are, and its terms. */
export function RoomBlock({
  row,
  name,
  isPast,
}: {
  row: HostNight;
  name: string;
  isPast: boolean;
}) {
  const allotment = row.allotment?.tenths ?? 0;
  const booked = row.booked?.tenths ?? 0;
  const held = row.held?.tenths ?? 0;
  const onSale = row.onSale?.tenths ?? 0;
  const selling = onSale > 0 && !!row.guestPrice?.micros && !isPast;
  const change = premium(row.guestPrice?.micros, row.usualRate?.micros);
  const status = row.isStopped
    ? "Stopped"
    : allotment === 0
      ? "Not open"
      : `${formatRoomNights(allotment)} rooms offered`;
  return (
    <div className={styles.block}>
      <div className={styles.h}>
        <b>{name}</b>
        <span>{status}</span>
      </div>
      <div className={styles.now}>
        <span className={cx(ui.lbl, styles.lbl)}>Selling now</span>
        {selling ? (
          <>
            <b>{usd(row.guestPrice?.micros)}</b>
            <span
              className={cx(
                change !== undefined && change >= 0 ? ui.pos : ui.muted,
              )}
            >
              {change !== undefined
                ? `${change >= 0 ? "+" : ""}${change}% vs usual rate `
                : "usual rate "}
              {usd(row.usualRate?.micros)}
            </span>
          </>
        ) : (
          <>
            <b>{isPast ? "Passed" : "Sold out"}</b>
            <span className={ui.muted}>
              usual rate {usd(row.usualRate?.micros)}
            </span>
          </>
        )}
      </div>
      <StackBar booked={booked} held={held} onSale={onSale} big />
      <ul className={styles.key}>
        <li>
          <Swatch fill="b" />
          <b>{formatRoomNights(booked)}</b> booked by guests
        </li>
        <li>
          <Swatch fill="h" />
          <b>{formatRoomNights(held)}</b> held by traders
        </li>
        <li>
          <Swatch fill="s" />
          <b>{formatRoomNights(onSale)}</b> still on sale
        </li>
      </ul>
      <div className={styles.stats}>
        <div>
          <span>Usual rate</span>
          <b>{usd(row.usualRate?.micros)}</b>
        </div>
        <div>
          <span>Demand</span>
          <b>{DEMAND[row.demandPreset] ?? "Not set"}</b>
        </div>
        <div>
          <span>Release time</span>
          <b>{shortInstant(row.releaseAt)}</b>
        </div>
      </div>
      <div className={styles.foot}>
        <span>
          Earned <b>{usd(row.payout?.availableNow?.micros)}</b>, held{" "}
          <b>{usd(row.payout?.heldForTraders?.micros)}</b>
        </span>
        <Link className={ui.link} href={tradeHref(row)}>
          See trading
        </Link>
      </div>
    </div>
  );
}
