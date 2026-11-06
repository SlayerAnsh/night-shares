"use client";
import { useQuery } from "@connectrpc/connect-query";
import { getProperty } from "@night-shares/proto/catalog/v1/catalog-CatalogService_connectquery";

// The stay behind a trip, for its name, photo and room type.
export function useTripProperty(propertyId: string, roomTypeId: string) {
  const query = useQuery(getProperty, { propertyId }, { staleTime: 300_000 });
  const property = query.data?.property;
  const room = property?.roomTypes.find((r) => r.id === roomTypeId);
  return { query, property, room };
}
