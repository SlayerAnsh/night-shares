"use client";
import { useAllMarkets } from "../../hooks/use-all-markets";
import { useDiscover } from "../../hooks/use-discover";
import { Feedback } from "../shared/Feedback";
import { MarketTable } from "../shared/MarketTable";
import page from "../shared/page.module.css";
import { Button } from "../ui/Button";
import { Empty } from "../ui/Empty";
import { Skeleton } from "../ui/Skeleton";
import { DiscoverFilters } from "./DiscoverFilters";
import { DiscoverOverview } from "./DiscoverOverview";
import { DiscoverSummary } from "./DiscoverSummary";

export function DiscoverScreen() {
  const { filters, query, gated, change, signIn } = useDiscover();
  const all = useAllMarkets();
  const cities = all.cities.length ? all.cities.length : 0;
  return (
    <div className={page.page}>
      <header className={page.head}>
        <h1>Markets</h1>
        <p>
          {all.nights.length
            ? `${all.nights.length} markets in ${cities} ${cities === 1 ? "city" : "cities"}. `
            : ""}
          Each market is one room type on one night.
        </p>
      </header>
      <DiscoverOverview nights={all.nights} loading={all.query.isPending} />
      <DiscoverFilters filters={filters} cities={all.cities} change={change} />
      {gated ? (
        <Empty>
          Your watchlist needs World ID.{" "}
          <Button variant="primary" onClick={signIn}>
            Sign in with World ID to see your watchlist
          </Button>
        </Empty>
      ) : (
        <>
          <Feedback error={query.error?.message} />
          {query.isPending && <Skeleton label="Loading markets" />}
          {query.data && (
            <>
              <DiscoverSummary nights={query.data.nights} />
              <MarketTable
                nights={query.data.nights}
                sort={filters.sort === 2 ? "risk" : "return"}
                onSort={(sort) => change("sort", sort === "risk" ? "risk" : "")}
                empty={
                  filters.watchlist
                    ? "No starred nights here yet. Open a market and press Watch."
                    : "Nothing matches these filters."
                }
              />
            </>
          )}
        </>
      )}
      <p className={page.foot}>
        Market making bots use the quote API, not this page.
      </p>
    </div>
  );
}
