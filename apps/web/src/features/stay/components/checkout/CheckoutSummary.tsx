"use client";
import { Button, Photo, Skeleton } from "@night-shares/design-system";
import type { useCheckout } from "../../hooks/use-checkout";
import { formatShort, plural } from "../../model/dates";
import { PriceLines } from "../detail/price/PriceLines";
import { QueryState } from "../shared/QueryState";
import styles from "./Checkout.module.css";

type Checkout = ReturnType<typeof useCheckout>;

export function CheckoutSummary({ c }: { c: Checkout }) {
  const { model, lockedQuote, lock, countdown } = c;
  const property = model.property.data?.property;
  const room = property?.roomTypes.find((r) => r.id === model.roomTypeId);
  const { state } = model;
  const expired = lock.isError || (lock.data && !countdown.seconds);
  return (
    <div className={styles.sum}>
      {property ? (
        <Photo src={property.photos[0]} className={styles.photo} />
      ) : (
        <Skeleton height={160} radius="var(--r-14)" />
      )}
      <h2 className={styles.name}>{property?.name ?? " "}</h2>
      <div className={styles.muted}>
        {room?.name}
        {property && ` · ${property.city}`}
      </div>
      <QueryState error={model.property.error} />
      {!model.hasDates ? (
        <p className={styles.warn}>
          Choose dates and a room on the stay page before checkout.
        </p>
      ) : (
        <div className={styles.facts}>
          <div>
            <span>Dates</span>
            <b>
              {formatShort(state.checkIn)} → {formatShort(state.checkOut)}
            </b>
          </div>
          <div>
            <span>Guests</span>
            <b>
              {plural(state.adults + state.kids, "guest")} ·{" "}
              {plural(state.rooms, "room")}
            </b>
          </div>
        </div>
      )}
      <QueryState
        pending={(model.quote.isPending && model.hasDates) || lock.isPending}
        error={model.quote.error}
        label="Locking your price"
      />
      {lockedQuote && <PriceLines quote={lockedQuote} />}
      {lock.data && countdown.seconds > 0 && (
        <div className={styles.hold} role="status">
          <span aria-hidden="true">●</span>
          <span>
            Price locked. You pay exactly this.{" "}
            <b className={styles.mono}>{countdown.label}</b> left
          </span>
        </div>
      )}
      {expired && (
        <div className={styles.expired}>
          <QueryState error={lock.error} />
          {!lock.error && <p className={styles.warn}>Price lock expired.</p>}
          <Button
            size="sm"
            disabled={lock.isPending}
            onClick={() => void c.relock().catch(() => {})}
          >
            Re-lock price
          </Button>
        </div>
      )}
    </div>
  );
}
