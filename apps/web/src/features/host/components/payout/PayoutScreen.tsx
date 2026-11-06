"use client";
import type {
  HotelSummary,
  Payout,
} from "@night-shares/proto/host/v1/hotel_pb";
import { formatUsdc } from "../../../../shared/format";
import { useBalance, usePayout, usePortfolio } from "../../hooks/use-host-data";
import { useHostSearch } from "../../hooks/use-host-search";
import { formatInstant, sumPayouts } from "../../model/host-view";
import { ErrorMessage, PayoutFacts } from "../shared/HostFacts";

function PropertyPayout({
  hotels,
  totals,
  complete,
}: {
  hotels: HotelSummary[];
  totals: Payout[];
  complete: boolean;
}) {
  const hotel = hotels[0];
  if (!hotel)
    return (
      <section>
        <h2>Total payout</h2>
        {complete ? (
          <PayoutFacts value={sumPayouts(totals)} />
        ) : (
          <p>Total unavailable until every hotel payout has loaded.</p>
        )}
      </section>
    );
  return (
    <PayoutRow
      hotel={hotel}
      remaining={hotels.slice(1)}
      totals={totals}
      complete={complete}
    />
  );
}

function PayoutRow({
  hotel,
  remaining,
  totals,
  complete,
}: {
  hotel: HotelSummary;
  remaining: HotelSummary[];
  totals: Payout[];
  complete: boolean;
}) {
  const query = usePayout(hotel.propertyId);
  return (
    <>
      <section id={hotel.propertyId}>
        <h2>
          <a href={`/host/${hotel.propertyId}`}>{hotel.name}</a>
        </h2>
        {query.isPending && <p>Loading payout…</p>}
        <ErrorMessage error={query.error} />
        {query.data?.payout && (
          <>
            <PayoutFacts value={query.data.payout} />
            <p>
              Earned USDC sweeps automatically to your wallet. Swept:{" "}
              {formatUsdc(query.data.payout.sweptTotal?.micros ?? 0n)}
            </p>
            {query.data.payout.lastSweepAt && (
              <p>
                Last sweep:{" "}
                {formatUsdc(query.data.payout.lastSweepAmount?.micros ?? 0n)} at{" "}
                {formatInstant(query.data.payout.lastSweepAt)}. Transaction:{" "}
                {query.data.payout.lastSweepTransactionId}
              </p>
            )}
          </>
        )}
      </section>
      <PropertyPayout
        hotels={remaining}
        totals={query.data?.payout ? [...totals, query.data.payout] : totals}
        complete={complete && !!query.data?.payout && !query.error}
      />
    </>
  );
}

export function PayoutScreen() {
  const portfolio = usePortfolio();
  const { search } = useHostSearch();
  const selected = search.get("property");
  const hotels = [...(portfolio.data?.hotels ?? [])].sort(
    (a, b) =>
      Number(b.propertyId === selected) - Number(a.propertyId === selected),
  );
  const wallet = useBalance();
  return (
    <>
      <a href="/host">All hotels</a>
      <h1>Payout</h1>
      <section aria-live="polite">
        <h2>Wallet balance</h2>
        {wallet.isPending ? (
          <p>Loading wallet…</p>
        ) : (
          wallet.data && <p>{formatUsdc(wallet.data.balance?.micros ?? 0n)}</p>
        )}
        <ErrorMessage error={wallet.error} />
      </section>
      {portfolio.isPending && <p>Loading hotels…</p>}
      <ErrorMessage error={portfolio.error} />
      {portfolio.data && (
        <>
          {!portfolio.data.hotels.length && <p>No hotels connected yet.</p>}
          <PropertyPayout hotels={hotels} totals={[]} complete={true} />
        </>
      )}
    </>
  );
}
