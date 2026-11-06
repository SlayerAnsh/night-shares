"use client";
import type { Trip } from "@night-shares/proto/stay/v1/trip_pb";
import Link from "next/link";
import { formatUsdc } from "../../../../shared/format";
import { useTripActions } from "../../hooks/use-trips";
import { QueryState } from "../shared/QueryState";
export function TripCard({
  trip,
  upcoming,
}: {
  trip: Trip;
  upcoming: boolean;
}) {
  const action = useTripActions(trip.id);
  const receipt = action.receipt.data?.receipt;
  return (
    <article>
      <h3>
        <Link href={`/stay/${trip.propertyId}`}>{trip.ref}</Link>
      </h3>
      <p>
        Hotel reference {trip.hotelRef} · Room {trip.roomTypeId}
      </p>
      <p>
        {trip.checkIn} to {trip.checkOut} · {trip.adults} adults · {trip.kids}{" "}
        kids · {trip.rooms} rooms
      </p>
      <p>Paid {formatUsdc(trip.total?.micros ?? 0n)}</p>
      <p>{trip.checkedIn ? "Checked in" : "Not checked in yet"}</p>
      {upcoming && !trip.checkedIn && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action.confirm().catch(() => {});
          }}
        >
          <label>
            Mock sign-in seed{" "}
            <input
              required
              value={action.seed}
              onChange={(e) => action.setSeed(e.target.value)}
            />
          </label>{" "}
          <button
            type="submit"
            disabled={action.verify.isPending || action.check.isPending}
          >
            Check in with World ID
          </button>
          <QueryState error={action.verify.error || action.check.error} />
        </form>
      )}
      {!trip.checkedIn && (
        <section>
          <button
            type="button"
            disabled={
              action.issue.isPending ||
              action.tap.isPending ||
              action.walk.isSuccess
            }
            onClick={() => void action.tapAtReception().catch(() => {})}
          >
            Tap reception tag
          </button>
          {action.tap.isSuccess && <p>Reception presence recorded.</p>}
          <button
            type="button"
            disabled={action.walk.isPending || action.walk.isSuccess}
            onClick={() => action.walk.mutate({ bookingId: trip.id })}
          >
            I was not let in
          </button>
          <p>
            Report within 24 hours after check-in time. A reception tap is
            required.
          </p>
          <QueryState
            error={action.issue.error || action.tap.error || action.walk.error}
          />
          {action.walk.data && (
            <p>
              Walk reported. Paid{" "}
              {formatUsdc(action.walk.data.paidToGuest?.micros ?? 0n)}.
            </p>
          )}
        </section>
      )}
      <button
        type="button"
        aria-expanded={action.showReceipt}
        onClick={action.toggleReceipt}
      >
        {action.showReceipt ? "Hide receipt" : "Receipt"}
      </button>
      {action.showReceipt && (
        <section>
          <h4>Receipt</h4>
          <QueryState
            pending={action.receipt.isPending}
            error={action.receipt.error}
          />
          {receipt && (
            <dl>
              <dt>Subtotal</dt>
              <dd>{formatUsdc(receipt.subtotal?.micros ?? 0n)}</dd>
              <dt>Fee</dt>
              <dd>{formatUsdc(receipt.trip?.fee?.micros ?? 0n)}</dd>
              <dt>Total</dt>
              <dd>{formatUsdc(receipt.trip?.total?.micros ?? 0n)}</dd>
              <dt>Wallet</dt>
              <dd>{receipt.walletAddress}</dd>
              <dt>Paid at</dt>
              <dd>
                {receipt.paidAt
                  ? new Date(
                      Number(receipt.paidAt.seconds) * 1000,
                    ).toISOString()
                  : "Unavailable"}
              </dd>
            </dl>
          )}
        </section>
      )}
    </article>
  );
}
