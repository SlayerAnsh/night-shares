"use client";
import { useQuery } from "@connectrpc/connect-query";
import {
  listDestinations,
  searchStays,
} from "@night-shares/proto/catalog/v1/catalog-CatalogService_connectquery";
import { useStaySearch } from "./use-stay-search";
export function useSearchResults() {
  const search = useStaySearch();
  const destinations = useQuery(listDestinations, {
    text: search.state.destination,
  });
  const results = useQuery(searchStays, search.state, {
    enabled:
      search.hasDates || (!search.state.checkIn && !search.state.checkOut),
  });
  return { ...search, destinations, results };
}
