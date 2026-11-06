"use client";
import { useQuery } from "@connectrpc/connect-query";
import { quoteStay } from "@night-shares/proto/stay/v1/stay-StayService_connectquery";
import { useStaySearch } from "./use-stay-search";
export function useRoomQuote(propertyId: string, roomTypeId: string) {
  const search = useStaySearch();
  return useQuery(
    quoteStay,
    { selection: { ...search.state, propertyId, roomTypeId } },
    { enabled: search.hasDates, staleTime: 60_000 },
  );
}
