"use client";
import { useNight } from "../../hooks/use-night";
import { money, parseNightKey, percent, riskName } from "../../model/market";
import { AgentOrders } from "../shared/AgentOrders";
import { Feedback } from "../shared/Feedback";
import { Listings } from "../shared/Listings";
import { NightDetails } from "./NightDetails";
import { OrderBook } from "./OrderBook";
import { Ticket } from "./Ticket";
export function NightScreen({ nightKey }: { nightKey: string }) {
  const night = parseNightKey(nightKey);
  return night ? (
    <NightContent night={night} />
  ) : (
    <p role="alert">Invalid night key.</p>
  );
}
function NightContent({
  night,
}: {
  night: NonNullable<ReturnType<typeof parseNightKey>>;
}) {
  const state = useNight(night);
  const card = state.detail.data?.night;
  return (
    <>
      <h1>{card ? `${card.propertyName} · ${card.roomTypeName}` : "Night"}</h1>
      <p>{night.date}</p>
      {state.detail.isPending && <p>Loading night…</p>}
      <Feedback error={state.detail.error?.message} />
      {card && (
        <p>
          Price {money(card.price)} · Fair price {money(card.fairPrice)} · Est.
          return {percent(card.estimatedReturnBps)} · Risk {riskName(card.risk)}
        </p>
      )}
      <button
        type="button"
        aria-pressed={state.watched}
        disabled={state.actions.pending}
        onClick={state.toggle}
      >
        {state.watched ? "Watching" : "Watch"}
      </button>
      <Feedback
        error={state.actions.error || state.watch.error?.message}
        notice={state.actions.notice}
      />
      {state.detail.data && <NightDetails detail={state.detail.data} />}
      <Feedback
        error={state.book.error?.message || state.tape.error?.message}
      />
      {state.book.data && (
        <OrderBook
          book={state.book.data}
          prints={state.tape.data?.prints ?? []}
        />
      )}
      <Ticket
        night={night}
        fair={state.book.data?.fairPrice?.micros}
        cap={state.book.data?.recallCap?.micros}
      />
      <Listings night={night} />
      <AgentOrders night={night} />
    </>
  );
}
