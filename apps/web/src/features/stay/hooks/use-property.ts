"use client";
import { useQuery } from "@connectrpc/connect-query";
import { getProperty } from "@night-shares/proto/catalog/v1/catalog-CatalogService_connectquery";
import { quoteStay } from "@night-shares/proto/stay/v1/stay-StayService_connectquery";
import { useStaySearch } from "./use-stay-search";
export function useProperty(propertyId: string) {
  const search = useStaySearch();
  const property = useQuery(getProperty, { propertyId });
  const roomTypeId =
    search.params.get("roomTypeId") ||
    property.data?.property?.roomTypes[0]?.id ||
    "";
  const selection = { ...search.state, propertyId, roomTypeId };
  const enabled = search.hasDates && !!roomTypeId;
  const quote = useQuery(
    quoteStay,
    { selection },
    { enabled, staleTime: 60_000 },
  );
  return { ...search, property, roomTypeId, quote };
}
