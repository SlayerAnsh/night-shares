"use client";
import { buttonClass, Kpis } from "@night-shares/design-system";
import type {
  HotelSummary,
  Payout,
} from "@night-shares/proto/host/v1/hotel_pb";
import Link from "next/link";
import { useBalance, usePayout, usePortfolio } from "../../hooks/use-host-data";
import { useHostSearch } from "../../hooks/use-host-search";
import { sumPayouts } from "../../model/host-view";
import { usd } from "../../model/money";
import { PayCard } from "../shared/PayCard";
import { Crumbs } from "../ui/Crumbs";
import page from "../ui/Page.module.css";
import { ErrorNote, Loading, StateCard } from "../ui/QueryState";
import ui from "../ui/ui.module.css";

// Each hotel's payout is its own query, so rows chain: each one passes its
// payout on, and the total renders once every hotel above it has loaded.
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
      <PayCard
        title="All hotels"
        subtitle={
          complete
            ? "Every connected hotel, added up."
            : "Total unavailable until every hotel payout has loaded."
        }
        payout={complete ? sumPayouts(totals) : undefined}
      />
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
      <PayCard
        id={hotel.propertyId}
        title={hotel.name}
        href={`/host/${hotel.propertyId}`}
        subtitle={`${hotel.city} · open nights up to 60 days ahead`}
        payout={query.data?.payout}
      >
        {query.isPending && (
          <Loading
            label={`Loading ${hotel.name} payout`}
            rows={[[120, 120, 120, 120]]}
          />
        )}
        {query.data?.chain && (
          <dl>
            <dt>Payout credit awaiting transfer retry</dt>
            <dd>{usd(query.data.chain.payoutCredit)}</dd>
            <dt>Host debt</dt>
            <dd>{usd(query.data.chain.debt)}</dd>
            <dt>Still owed to guests</dt>
            <dd>{usd(query.data.chain.owedToGuest)}</dd>
          </dl>
        )}
        <ErrorNote error={query.error} />
      </PayCard>
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
  const kpis = portfolio.data?.kpis;
  return (
    <>
      <Crumbs parts={[["All hotels", "/host"], ["Payouts"]]} />
      <div className={page.vHead}>
        <div>
          <h1 className={ui.display}>Payouts</h1>
          <div className={page.sub}>
            Paid in USDC to your wallet automatically as rooms sell. There is
            nothing to withdraw.
          </div>
        </div>
      </div>
      <section aria-live="polite">
        <Kpis
          label="Wallet and payouts"
          items={[
            {
              label: "Wallet balance",
              value: wallet.isPending
                ? "…"
                : wallet.data
                  ? usd(wallet.data.balance?.micros)
                  : "Unavailable",
              detail: "USDC in your wallet now",
              inverse: true,
            },
            {
              label: "Available now",
              value: usd(kpis?.availableNow?.micros),
              detail: "sweeps to your wallet automatically",
            },
            {
              label: "Revenue, next 30 nights",
              value: usd(kpis?.revenue?.micros),
              detail: "rooms booked by guests",
            },
            {
              label: "Hotels",
              value: String(portfolio.data?.hotels.length ?? "…"),
              detail: "each paid out on its own",
            },
          ]}
        />
        <ErrorNote error={wallet.error} />
      </section>
      {portfolio.isPending && (
        <Loading label="Loading hotels" rows={[[260], [260]]} />
      )}
      {!portfolio.isPending && !portfolio.data && (
        <StateCard
          title="Payouts could not load"
          error={portfolio.error}
          onRetry={() => void portfolio.refetch()}
        >
          Payouts still sweep to your wallet automatically while this page is
          unavailable.
        </StateCard>
      )}
      {portfolio.data && !hotels.length && (
        <StateCard
          title="No payouts yet"
          action={
            <Link
              href="/host#connect"
              className={buttonClass({ variant: "primary" })}
            >
              Connect a hotel
            </Link>
          }
        >
          Payouts start once a hotel is connected and its nights sell. Each
          hotel is paid out on its own, straight to your wallet.
        </StateCard>
      )}
      {portfolio.data && hotels.length > 0 && (
        <PropertyPayout hotels={hotels} totals={[]} complete={true} />
      )}
    </>
  );
}
