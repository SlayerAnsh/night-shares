"use client";
import { Button, EmptyState } from "@night-shares/design-system";
import { ErrorState } from "../../../../shared/fallback/ErrorState";
import { useAllMarkets } from "../../hooks/use-all-markets";
import { useDiscover } from "../../hooks/use-discover";
import { MarketTable } from "../shared/MarketTable";
import page from "../shared/page.module.css";
import { Skeleton } from "../ui/Skeleton";
import { DiscoverFilters } from "./DiscoverFilters";
import { DiscoverOverview } from "./DiscoverOverview";
import { DiscoverSummary } from "./DiscoverSummary";
import { WatchlistGate } from "./WatchlistGate";

export function DiscoverScreen() {
  const { filters, query, gated, change, reset } = useDiscover();
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
        <WatchlistGate />
      ) : (
        <>
          {query.error && (
            <ErrorState
              error={query.error}
              thing="These markets"
              onRetry={() => void query.refetch()}
              retrying={query.isFetching}
            />
          )}
          {query.isPending && <Skeleton label="Loading markets" />}
          {query.data && (
            <>
              <DiscoverSummary nights={query.data.nights} />
              <MarketTable
                nights={query.data.nights}
                sort={filters.sort === 2 ? "risk" : "return"}
                onSort={(sort) => change("sort", sort === "risk" ? "risk" : "")}
                empty={
                  <EmptyState
                    title={
                      filters.watchlist
                        ? "No watched nights match"
                        : "No markets match these filters"
                    }
                    action={
                      <Button size="sm" onClick={reset}>
                        Show all markets
                      </Button>
                    }
                  >
                    {filters.watchlist
                      ? "Open a market and press Watch to add it to your list."
                      : `${all.nights.length ? `${all.nights.length} markets are open right now. ` : ""}Try another city or turn a filter off.`}
                  </EmptyState>
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
