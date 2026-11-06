import { Code, ConnectError, type ServiceImpl } from "@connectrpc/connect";
import { MarketService } from "@night-shares/proto/market/v1/market_pb";
import type { Ports } from "../../container/ports";
export function createMarketModule(_ports: Ports) {
  const notBuiltYet = (): never => {
    throw new ConnectError("not built yet", Code.Unimplemented);
  };
  const handler: ServiceImpl<typeof MarketService> = {
    discover: notBuiltYet,
    getNight: notBuiltYet,
    getBook: notBuiltYet,
    listTape: notBuiltYet,
    quoteBuy: notBuiltYet,
    quoteSell: notBuiltYet,
    buy: notBuiltYet,
    sell: notBuiltYet,
    postAsk: notBuiltYet,
    cancelAsk: notBuiltYet,
    getPortfolio: notBuiltYet,
    toggleWatch: notBuiltYet,
    listWatch: notBuiltYet,
    createAgentOrder: notBuiltYet,
    approveAgentOrder: notBuiltYet,
  };
  return { service: MarketService, handler };
}
