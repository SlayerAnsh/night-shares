import { buttonClass, EmptyState } from "@night-shares/design-system";
import type { ListWatchResponse } from "@night-shares/proto/market/v1/market_pb";
import type { UseQueryResult } from "@tanstack/react-query";
import Link from "next/link";
import { ErrorState } from "../../../../shared/fallback/ErrorState";
import { MarketTable } from "../shared/MarketTable";
import { Section } from "../ui/Section";
import { Skeleton } from "../ui/Skeleton";

// Nights you starred, in the same table as the market list.
export function Watchlist({
  query,
}: {
  query: Pick<
    UseQueryResult<ListWatchResponse, Error>,
    "data" | "error" | "isPending" | "isFetching" | "refetch"
  >;
}) {
  return (
    <Section
      id="h-watch"
      title="Watchlist"
      line="Nights you are watching. Press Watch on any market to add it."
    >
      {query.error && !query.data && (
        <ErrorState
          inline
          error={query.error}
          thing="Your watchlist"
          need="orb"
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      )}
      {query.isPending && <Skeleton rows={3} label="Loading watchlist" />}
      {query.data && (
        <MarketTable
          nights={query.data.nights}
          empty={
            <EmptyState
              title="You are not watching any nights yet"
              action={
                <Link
                  href="/trade"
                  className={buttonClass({ variant: "ghost", size: "sm" })}
                >
                  Find a market to watch
                </Link>
              }
            >
              Press Watch on a market to follow its price, fair value and
              release time from here.
            </EmptyState>
          }
        />
      )}
    </Section>
  );
}
