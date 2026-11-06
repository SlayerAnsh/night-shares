import { MarketService } from "@night-shares/proto/market/v1/market_pb";
import type { Ports } from "../../container/ports";
import { createMarketHandler } from "./market.handler";
import { createMemoryMarketRepo } from "./repo/market-repo.memory";
export function createMarketModule(ports: Ports) {
  const repo = createMemoryMarketRepo();
  return {
    service: MarketService,
    handler: createMarketHandler({ ports, repo }),
  };
}
