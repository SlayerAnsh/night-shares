import type { ServiceImpl } from "@connectrpc/connect";
import type { MarketService } from "@night-shares/proto/market/v1/market_pb";
import { optionalUser, requireUser } from "../../server/auth-context";
import { DomainError } from "../../shared/errors/domain-error";
import { approveAgentOrder } from "./use-cases/account/approve-agent-order";
import { cancelAsk } from "./use-cases/account/cancel-ask";
import { createAgentOrder } from "./use-cases/account/create-agent-order";
import { getPortfolio } from "./use-cases/account/get-portfolio";
import { listWatch } from "./use-cases/account/list-watch";
import { postAsk } from "./use-cases/account/post-ask";
import { toggleWatch } from "./use-cases/account/toggle-watch";
import { type Deps, nightKey, quantity } from "./use-cases/context";
import { discover } from "./use-cases/queries/discover";
import { getBook } from "./use-cases/queries/get-book";
import { getNight } from "./use-cases/queries/get-night";
import { listTape } from "./use-cases/queries/list-tape";
import { buy } from "./use-cases/trading/buy";
import { quoteBuy } from "./use-cases/trading/quote-buy";
import { quoteSell } from "./use-cases/trading/quote-sell";
import { sell } from "./use-cases/trading/sell";

function money(value?: { micros: bigint }) {
  if (!value || value.micros < 0n)
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Provide a nonnegative USDC amount.",
    );
  return value.micros;
}
export function createMarketHandler(
  deps: Deps,
): ServiceImpl<typeof MarketService> {
  return {
    discover: (r, ctx) => discover(deps, r, optionalUser(ctx)),
    getNight: (r) => getNight(deps, nightKey(r.night)),
    getBook: (r) => getBook(deps, nightKey(r.night)),
    listTape: (r) => listTape(deps, nightKey(r.night)),
    quoteBuy: (r, ctx) => ({
      quote: quoteBuy(
        deps,
        nightKey(r.night),
        quantity(r.size),
        optionalUser(ctx),
      ),
    }),
    quoteSell: (r, ctx) => ({
      quote: quoteSell(
        deps,
        nightKey(r.night),
        quantity(r.size),
        optionalUser(ctx),
      ),
    }),
    buy: (r, ctx) => {
      const user = requireUser(ctx);
      return deps.repo.exclusive(user.humanId, async () => ({
        execution: await buy(
          deps,
          user,
          nightKey(r.night),
          quantity(r.size),
          money(r.maxTotal),
        ),
      }));
    },
    sell: (r, ctx) => {
      const user = requireUser(ctx);
      return deps.repo.exclusive(user.humanId, async () => ({
        execution: await sell(
          deps,
          user,
          nightKey(r.night),
          quantity(r.size),
          money(r.minTotal),
        ),
      }));
    },
    postAsk: (r, ctx) => {
      const user = requireUser(ctx);
      return deps.repo.exclusive(user.humanId, async () =>
        postAsk(
          deps,
          user,
          nightKey(r.night),
          quantity(r.size),
          money(r.price),
        ),
      );
    },
    cancelAsk: (r, ctx) => {
      const user = requireUser(ctx);
      return deps.repo.exclusive(user.humanId, async () =>
        cancelAsk(deps, user, r.askId),
      );
    },
    getPortfolio: (_, ctx) => getPortfolio(deps, requireUser(ctx)),
    toggleWatch: (r, ctx) =>
      toggleWatch(deps, requireUser(ctx), nightKey(r.night)),
    listWatch: (_, ctx) => listWatch(deps, requireUser(ctx)),
    createAgentOrder: (r, ctx) => {
      const user = requireUser(ctx);
      return deps.repo.exclusive(user.humanId, () =>
        createAgentOrder(
          deps,
          user,
          nightKey(r.night),
          quantity(r.size),
          money(r.budget),
        ),
      );
    },
    approveAgentOrder: (r, ctx) => {
      const user = requireUser(ctx);
      return deps.repo.exclusive(user.humanId, () =>
        approveAgentOrder(deps, user, r.orderId, r.verificationToken),
      );
    },
  };
}
