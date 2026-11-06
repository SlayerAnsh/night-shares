"use client";
import { Button, Card } from "@night-shares/design-system";
import type { Property } from "@night-shares/proto/catalog/v1/property_pb";
import { useState } from "react";
import { useSession } from "../../../../../session/SessionProvider";
import { formatUsdc } from "../../../../../shared/format";
import { useProperty } from "../../../hooks/use-property";
import { formatShort, plural } from "../../../model/dates";
import { summarizeQuote } from "../../../model/quote";
import { GuestCounters } from "../../shared/GuestCounters";
import { Icon } from "../../shared/Icon";
import { QueryState } from "../../shared/QueryState";
import { PriceLines } from "../price/PriceLines";
import { DATES_ID } from "../sections/DatesSection";
import styles from "./BookCard.module.css";

// Scroll to the inline calendar and flash its outline, as the mock does.
function jumpToDates() {
  const el = document.getElementById(DATES_ID);
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
  el?.animate(
    [
      { boxShadow: "0 0 0 3px var(--accent)" },
      { boxShadow: "0 0 0 0 transparent" },
    ],
    { duration: 900, easing: "ease-out" },
  );
}

// Sticky booking card (.book) beside the stay details.
export function BookCard({
  propertyId,
  property,
  onBook,
}: {
  propertyId: string;
  property: Property;
  onBook: () => void;
}) {
  const model = useProperty(propertyId);
  const { isSignedIn } = useSession();
  const [guestsOpen, setGuestsOpen] = useState(false);
  const { state, hasDates } = model;
  const quote = hasDates ? model.quote.data?.quote : undefined;
  const summary = quote && summarizeQuote(quote);
  const room = property.roomTypes.find((r) => r.id === model.roomTypeId);
  return (
    <Card as="aside" className={styles.book} aria-label="Book this stay">
      <div className={styles.ptop}>
        <div>
          {summary ? (
            <>
              <b>{formatUsdc(summary.perNight, { decimals: 0 })}</b>{" "}
              <span className={styles.muted}>avg / night</span>
            </>
          ) : (
            <b className={styles.pick}>
              {hasDates ? "Pricing your stay" : "Pick your dates"}
            </b>
          )}
        </div>
        <span className={styles.rate}>
          <Icon name="star" />
          {property.rating.toFixed(2)}
        </span>
      </div>
      <div className={styles.dates}>
        {(["checkIn", "checkOut"] as const).map((key) => (
          <button key={key} type="button" onClick={jumpToDates}>
            <span className={styles.lbl}>
              {key === "checkIn" ? "Check-in" : "Check-out"}
            </span>
            {state[key] && hasDates ? (
              formatShort(state[key])
            ) : (
              <span className={styles.muted}>Add date</span>
            )}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={styles.gsel}
        aria-expanded={guestsOpen}
        onClick={() => setGuestsOpen(!guestsOpen)}
      >
        <div>
          <span className={styles.lbl}>Guests</span>
          {plural(state.adults + state.kids, "guest")} ·{" "}
          {plural(state.rooms, "room")}
        </div>
        <span className={styles.muted}>{room?.name}</span>
      </button>
      {guestsOpen && (
        <div className={styles.guests}>
          <GuestCounters onDone={() => setGuestsOpen(false)} />
        </div>
      )}
      <Button
        variant="primary"
        size="lg"
        block
        className={styles.reserve}
        disabled={hasDates && (!quote || model.quote.isFetching)}
        onClick={hasDates ? onBook : jumpToDates}
      >
        {hasDates ? "Book now" : "Check availability"}
      </Button>
      {hasDates && (
        <QueryState
          pending={model.quote.isPending}
          error={model.quote.error}
          label="Pricing your stay"
        />
      )}
      {quote ? (
        <>
          <PriceLines quote={quote} />
          <p className={styles.sure}>
            Guests come first. If rooms run short, one is taken back from a
            trader for you, and the price is capped.
          </p>
          {!isSignedIn && (
            <p className={styles.sure}>
              You will sign in with World ID before paying. Your stay, dates and
              room are kept.
            </p>
          )}
        </>
      ) : (
        !hasDates && (
          <p className={styles.hint}>
            Pick dates to see the total. You won't be charged yet.
          </p>
        )
      )}
    </Card>
  );
}
