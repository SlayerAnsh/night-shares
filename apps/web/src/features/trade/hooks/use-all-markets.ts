"use client";
import { useQuery } from "@connectrpc/connect-query";
import { discover } from "@night-shares/proto/market/v1/market-MarketService_connectquery";

// Every open market, unfiltered: feeds the exchange overview and the city chips.
export function useAllMarkets() {
  const query = useQuery(discover, {});
  const nights = query.data?.nights ?? [];
  const cities = Array.from(new Set(nights.map((card) => card.city))).sort();
  return { query, nights, cities };
}
