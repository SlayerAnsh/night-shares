import { Code, ConnectError, type ServiceImpl } from "@connectrpc/connect";
import { CatalogService } from "@night-shares/proto/catalog/v1/catalog_pb";
import type { Ports } from "../../container/ports";
export function createCatalogModule(_ports: Ports) {
  const notBuiltYet = (): never => {
    throw new ConnectError("not built yet", Code.Unimplemented);
  };
  const handler: ServiceImpl<typeof CatalogService> = {
    listDestinations: notBuiltYet,
    searchStays: notBuiltYet,
    getProperty: notBuiltYet,
  };
  return { service: CatalogService, handler };
}
