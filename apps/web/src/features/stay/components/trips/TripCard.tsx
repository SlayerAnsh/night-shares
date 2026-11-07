"use client";
import { buttonClass, Photo } from "@night-shares/design-system";
import type { Trip } from "@night-shares/proto/stay/v1/trip_pb";
import Link from "next/link";
import { formatUsdc } from "../../../../shared/format";
import { TxHash } from "../../../../shared/tx/TxHash";
import { txHashOf } from "../../../../shared/tx/tx";
import { useTripProperty } from "../../hooks/use-trip-property";
import { useTripActions } from "../../hooks/use-trips";
import { formatShort, nightsBetween, plural } from "../../model/dates";
import { ReceiptPanel } from "./ReceiptPanel";
import { TripStatus } from "./TripStatus";
import styles from "./Trips.module.css";

// One booking (.trip): photo, facts, then status and the reception actions.
export function TripCard({
  trip,
  upcoming,
}: {
  trip: Trip;
  upcoming: boolean;
}) {
  const action = useTripActions(trip.id);
  const { property, room } = useTripProperty(trip.propertyId, trip.roomTypeId);
  const nights = nightsBetween(trip.checkIn, trip.checkOut);
  const guests = trip.adults + trip.kids;
  const hash = txHashOf(trip);
  return (
    <article className={`${styles.trip} ${upcoming ? "" : styles.past}`}>
      <Photo src={property?.photos[0]} className={styles.tripPhoto} />
      <div className={styles.tripBody}>
        <div className={styles.top}>
          <div>
            <h3>{property?.name ?? trip.ref}</h3>
            <span className={styles.muted}>
              {property && `${property.city}, ${property.country}`}
              {room && ` · ${room.name}`}
            </span>
          </div>
          <Link
            href={`/stay/${trip.propertyId}`}
            className={buttonClass({ size: "sm" })}
          >
            View stay
          </Link>
        </div>
        <div className={styles.facts}>
          <div>
            <span>Dates</span>
            <b>
              {formatShort(trip.checkIn)} → {formatShort(trip.checkOut)}
            </b>
            <em>
              {plural(nights, "night")} · {plural(guests, "guest")} ·{" "}
              {plural(trip.rooms, "room")}
            </em>
          </div>
          <div>
            <span>Hotel reference</span>
            {trip.hotelSyncPending ? (
              <b>Sending to the hotel</b>
            ) : (
              <b className={styles.mono}>{trip.hotelRef}</b>
            )}
            <em>Booking {trip.ref}</em>
          </div>
          <div>
            <span>Paid</span>
            <b className={styles.mono}>
              {formatUsdc(trip.total?.micros ?? 0n)}
            </b>
            <em>From your wallet on Arc</em>
          </div>
        </div>
        {hash && <TxHash hash={hash} block />}
        <TripStatus
          trip={trip}
          upcoming={upcoming}
          action={action}
          hotel={property?.name ?? "the hotel"}
        />
        {action.showReceipt && <ReceiptPanel action={action} />}
      </div>
    </article>
  );
}
