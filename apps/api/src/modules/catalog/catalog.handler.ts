import type { ServiceImpl } from "@connectrpc/connect";
import type { CatalogService } from "@night-shares/proto/catalog/v1/catalog_pb";
import { propertyToProto } from "./mappers/property";
import type { createGetProperty } from "./use-cases/get-property";
import type { createListDestinations } from "./use-cases/list-destinations";
import type { createSearchStays } from "./use-cases/search-stays";
export function createCatalogHandler(cases: {
  refreshNights?: () => Promise<void>;
  onChain?: boolean;
  walkIncidents: (
    propertyId: string,
  ) => ReturnType<typeof import("../walk/repo/incidents").walkIncidents>;
  getProperty: ReturnType<typeof createGetProperty>;
  listDestinations: ReturnType<typeof createListDestinations>;
  searchStays: ReturnType<typeof createSearchStays>;
}): ServiceImpl<typeof CatalogService> {
  return {
    getProperty: (req) => ({
      property: propertyToProto(cases.getProperty(req.propertyId)),
      onChain: cases.onChain ?? false,
      walkIncidents: cases.walkIncidents(req.propertyId),
    }),
    listDestinations: (req) => ({
      destinations: cases.listDestinations(req.text),
    }),
    searchStays: async (req) => {
      await cases.refreshNights?.();
      return { stays: cases.searchStays(req) };
    },
  };
}
