import { buttonClass, Icon } from "@night-shares/design-system";
import type { Property } from "@night-shares/proto/catalog/v1/property_pb";
import type { Trip } from "@night-shares/proto/stay/v1/trip_pb";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatUsdc } from "../../../../shared/format";
import { formatShort, nightsBetween, plural } from "../../model/dates";
import styles from "./Checkout.module.css";

// Confirmation (.success, .g-conf): booked, sent to the hotel, then the
// optional World ID check in at the property.
export function BookingSuccess({
  trip,
  property,
}: {
  trip: Trip;
  property?: Property;
}) {
  const nights = nightsBetween(trip.checkIn, trip.checkOut);
  return (
    <div className={styles.success}>
      <div className={styles.ok}>
        <Icon name="check" />
      </div>
      <h1 className={styles.successTitle}>
        {property ? `You're going to ${property.city}` : "You're booked"}
      </h1>
      <p className={styles.muted}>
        {property?.name && `${property.name} · `}
        {formatShort(trip.checkIn)} → {formatShort(trip.checkOut)} ·{" "}
        {plural(nights, "night")}
      </p>
      <div className={styles.ref}>
        <span className={styles.muted}>Booking</span>
        <b>{trip.ref}</b>
      </div>
      <div className={styles.conf}>
        <Step done title="Booked">
          {plural(nights * trip.rooms, "room night")}, paid{" "}
          {formatUsdc(trip.total?.micros ?? 0n)}. Price locked.
        </Step>
        <Step done title="Your hotel has your booking">
          Sent to {property?.name ?? "the hotel"}'s reservation system. Hotel
          reference <span className={styles.mono}>{trip.hotelRef}</span>.
        </Step>
        <Step title="Check in with World ID">
          Optional. At the property, tap the tag at reception and check in from
          My trips. The front desk can check you in too.
        </Step>
      </div>
      <div className={styles.cta}>
        <Link href="/stay" className={buttonClass()}>
          Find another stay
        </Link>
        <Link
          href="/stay/trips"
          className={buttonClass({ variant: "secondary" })}
        >
          View trip
        </Link>
      </div>
    </div>
  );
}

function Step({
  done = false,
  title,
  children,
}: {
  done?: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.confRow}>
      <span
        className={`${styles.gdot} ${done ? styles.done : ""}`}
        aria-hidden="true"
      />
      <div>
        <b>{title}</b>
        <span>{children}</span>
      </div>
    </div>
  );
}
