import { CatalogService } from "@night-shares/proto/catalog/v1/catalog_pb";
import type { Ports } from "../../container/ports";
import { createCatalogHandler } from "./catalog.handler";
import { createGetProperty } from "./use-cases/get-property";
import { createListDestinations } from "./use-cases/list-destinations";
import { createSearchStays } from "./use-cases/search-stays";
export function createCatalogModule(ports: Ports) {
  const handler = createCatalogHandler({
    getProperty: createGetProperty(ports),
    listDestinations: createListDestinations(ports),
    searchStays: createSearchStays(ports),
  });
  return { service: CatalogService, handler };
}
