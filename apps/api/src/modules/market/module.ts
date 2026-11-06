import { MarketService } from "@night-shares/proto/market/v1/market_pb";
import type { Ports } from "../../container/ports";
import { createMarketHandler } from "./market.handler";
import { createSqliteMarketRepo } from "./repo/market-repo.sqlite";
export function createMarketModule(ports: Ports) {
  const repo = createSqliteMarketRepo(ports.db);
  return {
    service: MarketService,
    handler: createMarketHandler({ ports, repo }),
  };
}
