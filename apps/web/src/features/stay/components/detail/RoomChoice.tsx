"use client";
import type { RoomType } from "@night-shares/proto/catalog/v1/property_pb";
import { formatUsdc } from "../../../../shared/format";
import { useRoomQuote } from "../../hooks/use-room-quote";
import { useStaySearch } from "../../hooks/use-stay-search";
import { isOneNightRejection } from "../../model/on-chain";
import { summarizeQuote } from "../../model/quote";
import { QueryState } from "../shared/QueryState";
import styles from "./RoomChoice.module.css";

// One room type as a radio card (.room). With dates it shows the average
// price per room night for the stay.
export function RoomChoice({
  propertyId,
  room,
  selected,
}: {
  propertyId: string;
  room: RoomType;
  selected: boolean;
}) {
  const { update, hasDates } = useStaySearch();
  const quote = useRoomQuote(propertyId, room.id);
  const summary = quote.data?.quote && summarizeQuote(quote.data.quote);
  return (
    <label className={`${styles.room} ${selected ? styles.on : ""}`}>
      <input
        type="radio"
        name="room"
        className={styles.input}
        checked={selected}
        onChange={() => update({ roomTypeId: room.id })}
      />
      <span className={styles.radio} aria-hidden="true" />
      <span className={styles.text}>
        <b>{room.name}</b>
        <span>{room.spec}</span>
      </span>
      <span className={styles.price}>
        {!hasDates ? (
          <span className={styles.sub}>Pick dates for a price</span>
        ) : summary ? (
          <>
            {formatUsdc(summary.perNight, { decimals: 0 })}
            <span className={styles.sub}>avg / night</span>
          </>
        ) : isOneNightRejection(quote.error) ? (
          <span className={styles.sub}>1 room, 1 night on chain</span>
        ) : (
          <QueryState
            pending={quote.isPending}
            error={quote.error}
            label="Pricing"
          />
        )}
      </span>
    </label>
  );
}
