import { expect, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import { createHandlerContext } from "@connectrpc/connect";
import { AskSchema } from "@night-shares/proto/market/v1/book_pb";
import {
  MarketService,
  PostAskRequestSchema,
  QuoteBuyRequestSchema,
} from "@night-shares/proto/market/v1/market_pb";
import type { ArcDeployment } from "../../ports/arc-deployment/arc-deployment";
import { serialize } from "../../ports/chain-executor/chain-executor";
import type { ChainReader } from "../../ports/chain-reader/chain-reader";
import type { WalletCustody } from "../../ports/wallet-custody/wallet-custody";
import { userKey } from "../../server/auth-context";
import { configureChainMarket } from "./chain/runtime";
import { createMarketHandler } from "./market.handler";
import { fixture } from "./testing/fixture";

test("PostAsk scopes replay by deployment and human and validates its header", async () => {
  const deps = await fixture();
  const { ports } = deps;
  ports.chainExecutor = { mode: "chain" } as NonNullable<
    typeof ports.chainExecutor
  >;
  ports.chainReader = { fingerprint: "test-deployment" } as ChainReader;
  configureChainMarket(ports, {
    deployment: {} as ArcDeployment,
    custody: {} as WalletCustody,
  });
  ports.db.exec(
    "CREATE TABLE market_chain_ask_requests (id TEXT PRIMARY KEY, request TEXT NOT NULL, result TEXT NOT NULL)",
  );
  const request = create(PostAskRequestSchema, {
    night: deps.night,
    size: { tenths: 1 },
    price: { micros: 10n },
  });
  const response = {
    ask: create(AskSchema, { id: "original" }),
    isAboveTwiceFair: false,
    isAboveRecallCap: false,
  };
  ports.db.query("INSERT INTO market_chain_ask_requests VALUES (?, ?, ?)").run(
    `market:test-deployment:${deps.user.humanId}:retry`,
    serialize({
      key: deps.key,
      size: 1,
      price: 10n,
      expiry: undefined,
      nonce: undefined,
      signature: "",
    }),
    serialize(response),
  );
  const context = createHandlerContext({
    service: MarketService,
    method: MarketService.method.postAsk,
    protocolName: "connect",
    requestMethod: "POST",
    url: "http://localhost",
    requestHeader: { "idempotency-key": "retry" },
  });
  context.values.set(userKey, deps.user);
  const handler = createMarketHandler(deps);
  expect(await handler.postAsk(request, context)).toEqual(response);
  context.requestHeader.set("idempotency-key", "bad key");
  await expect(handler.postAsk(request, context)).rejects.toThrow(
    "Invalid idempotency-key header.",
  );
  deps.ports.db.close();
});

test("mock quote advertises the default slippage tolerance", async () => {
  const deps = await fixture();
  const context = createHandlerContext({
    service: MarketService,
    method: MarketService.method.quoteBuy,
    protocolName: "connect",
    requestMethod: "POST",
    url: "http://localhost",
  });
  const quote = await createMarketHandler(deps).quoteBuy(
    create(QuoteBuyRequestSchema, { night: deps.night, size: { tenths: 1 } }),
    context,
  );
  expect(quote.slippageBps).toBe(50);
  deps.ports.db.close();
});
