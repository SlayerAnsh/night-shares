"use client";
import { useQuery } from "@connectrpc/connect-query";
import type { Ask } from "@night-shares/proto/market/v1/book_pb";
import { getNight } from "@night-shares/proto/market/v1/market-MarketService_connectquery";
import type { Holding } from "@night-shares/proto/market/v1/portfolio_pb";
import { nightHref } from "../model/market";
export function useHolding(holding: Holding, listings: Ask[]) {
  const detail = useQuery(
    getNight,
    { night: holding.night },
    { enabled: !!holding.night },
  );
  const listed = listings
    .filter(
      (ask) =>
        ask.night &&
        holding.night &&
        nightHref(ask.night) === nightHref(holding.night),
    )
    .reduce((total, ask) => total + (ask.size?.tenths ?? 0), 0);
  return { detail, card: detail.data?.night, listed };
}
