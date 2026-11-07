"use client";
import { Alert, Button, Card, Icon } from "@night-shares/design-system";
import type { Property } from "@night-shares/proto/catalog/v1/property_pb";
import { useState } from "react";
import { useSession } from "../../../../../session/SessionProvider";
import { formatUsdc } from "../../../../../shared/format";
import { useStaysOnChain } from "../../../hooks/use-on-chain";
import { useProperty } from "../../../hooks/use-property";
import { formatShort, nightsBetween, plural } from "../../../model/dates";
import { isOneNightRejection, overOneNight } from "../../../model/on-chain";
import { summarizeQuote } from "../../../model/quote";
import { GuestCounters } from "../../shared/GuestCounters";
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
  // On chain the API books exactly 1 room for 1 night: say so before the
  // guest picks more, and in plain words if a quote was turned down for it.
  const onChain = useStaysOnChain();
  const rejected = isOneNightRejection(model.quote.error);
  const over =
    hasDates &&
    overOneNight(nightsBetween(state.checkIn, state.checkOut), state.rooms);
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
              {rejected
                ? "Pick one night"
                : hasDates
                  ? "Pricing your stay"
                  : "Pick your dates"}
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
      {onChain && !rejected && (
        <p className={styles.sure} role="note">
          On-chain stays are 1 room for 1 night.
          {over && " Choose a single night and one room to book."}
        </p>
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
      {hasDates &&
        (rejected ? (
          <Alert>
            On-chain stays are 1 room for 1 night. Pick a single night and one
            room to see the price.
          </Alert>
        ) : (
          <QueryState
            pending={model.quote.isPending}
            error={model.quote.error}
            label="Pricing your stay"
          />
        ))}
      {quote ? (
        <>
          <PriceLines quote={quote} />
          {quote.onChain && (
            <p className={styles.sure}>
              Your final price is confirmed on chain before payment and cannot
              exceed this quote.
            </p>
          )}
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
