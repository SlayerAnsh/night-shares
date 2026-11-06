"use client";
import { PayMethod } from "@night-shares/proto/stay/v1/trip_pb";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatUsdc } from "../../../../shared/format";
import { useCheckout } from "../../hooks/use-checkout";
import { QuoteDetails } from "../detail/QuoteDetails";
import { QueryState } from "../shared/QueryState";
export function CheckoutScreen({ propertyId }: { propertyId: string }) {
  const params = useSearchParams();
  return (
    <CheckoutForm key={`${propertyId}:${params}`} propertyId={propertyId} />
  );
}
function CheckoutForm({ propertyId }: { propertyId: string }) {
  const c = useCheckout(propertyId);
  const trip = c.booking.data?.trip;
  if (trip)
    return (
      <section>
        <h1>You're booked</h1>
        <p>Trip reference {trip.ref}</p>
        <p>Hotel reference {trip.hotelRef}</p>
        <p>
          {trip.checkIn} to {trip.checkOut} ·{" "}
          {formatUsdc(trip.total?.micros ?? 0n)}
        </p>
        <p>Booked. Sent to your hotel.</p>
        <Link href="/stay/trips">My trips</Link>
      </section>
    );
  return (
    <section>
      <h1>Confirm and pay</h1>
      <Link href={c.model.href(`/stay/${propertyId}`)}>Back to stay</Link>
      <QueryState
        pending={c.model.quote.isPending && c.model.hasDates}
        error={c.model.quote.error || c.model.property.error}
      />
      {!c.model.hasDates && (
        <p>Choose dates and a room on the stay page before checkout.</p>
      )}
      <h2>{c.model.property.data?.property?.name}</h2>
      <p>
        {c.model.state.checkIn} to {c.model.state.checkOut} ·{" "}
        {c.model.state.adults} adults · {c.model.state.kids} kids ·{" "}
        {c.model.state.rooms} rooms
      </p>
      <p>
        {
          c.model.property.data?.property?.roomTypes.find(
            (room) => room.id === c.model.roomTypeId,
          )?.name
        }
      </p>
      {c.lockedQuote && <QuoteDetails quote={c.lockedQuote} />}
      <QueryState pending={c.lock.isPending} error={c.lock.error} />
      {c.lock.data && (
        <p role="status">
          {c.countdown.seconds
            ? `Price locked. You pay exactly this. ${c.countdown.label} remaining.`
            : "Price lock expired."}
        </p>
      )}
      {(c.lock.isError || (c.lock.data && !c.countdown.seconds)) && (
        <button
          type="button"
          disabled={c.lock.isPending}
          onClick={() => void c.relock().catch(() => {})}
        >
          Re-lock price
        </button>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void c.pay().catch(() => {});
        }}
      >
        <label>
          Guest name{" "}
          <input
            required
            autoComplete="name"
            value={c.guestName}
            onChange={(e) => c.setGuestName(e.target.value)}
          />
        </label>{" "}
        <label>
          Email{" "}
          <input
            required
            type="email"
            autoComplete="email"
            value={c.guestEmail}
            onChange={(e) => c.setGuestEmail(e.target.value)}
          />
        </label>
        <p>Sent only to your hotel.</p>
        <label>
          Payment{" "}
          <select
            value={c.payMethod}
            onChange={(e) => c.setPayMethod(Number(e.target.value))}
          >
            <option value={PayMethod.USDC}>USDC</option>
            <option value={PayMethod.CARD}>Card</option>
          </select>
        </label>
        <p>
          {c.payMethod === PayMethod.CARD
            ? "Pay by card, settled in USDC."
            : "Pay with USDC from your wallet on Arc."}
        </p>
        <button
          type="submit"
          disabled={
            !c.countdown.seconds || c.booking.isPending || c.lock.isPending
          }
        >
          Pay {formatUsdc(c.lockedQuote?.total?.micros ?? 0n)} and book
        </button>
        {c.booking.isPending && (
          <div role="status">
            <p>
              {c.payMethod === PayMethod.CARD
                ? "Charging your card"
                : "Paying in USDC"}
            </p>
            <ol>
              <li>Locking your price</li>
              <li>Booking your room</li>
              <li>Sending to your hotel</li>
            </ol>
          </div>
        )}
        <QueryState error={c.booking.error} />
        <p>
          Paying books your room straight away, in one step. By paying you agree
          to the house rules.
        </p>
      </form>
    </section>
  );
}
