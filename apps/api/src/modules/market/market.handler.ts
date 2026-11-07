import type { ServiceImpl } from "@connectrpc/connect";
import type { MarketService } from "@night-shares/proto/market/v1/market_pb";
import { optionalUser, requireUser } from "../../server/auth-context";
import { DomainError } from "../../shared/errors/domain-error";
import { prepareChainAsk } from "./chain/asks";
import { chainBook } from "./chain/book";
import { chainPortfolio } from "./chain/positions";
import { chainMarket, isChain } from "./chain/runtime";
import { quoteChainTrade } from "./chain/trading";
import { cancelAllAsks } from "./orders/cancel-all";
import { prepareAsk } from "./orders/prepare";
import { approveAgentOrder } from "./use-cases/account/approve-agent-order";
import { cancelAsk } from "./use-cases/account/cancel-ask";
import {
  claimCutoff,
  listCutoffClaims,
} from "./use-cases/account/claim-cutoff";
import { createAgentOrder } from "./use-cases/account/create-agent-order";
import { getPortfolio } from "./use-cases/account/get-portfolio";
import { listWatch } from "./use-cases/account/list-watch";
import { postAskWithCustody } from "./use-cases/account/post-ask";
import { toggleWatch } from "./use-cases/account/toggle-watch";
import { getAgentCheckpoint } from "./use-cases/agent/get-checkpoint";
import { linkAgentPass } from "./use-cases/agent/link-agent-pass";
import { setAgentBudget } from "./use-cases/agent/set-budget";
import { startAgentCheckpoint } from "./use-cases/agent/start-checkpoint";
import { getAgentWallet, transferAgentWallet } from "./use-cases/agent/wallet";
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
    linkAgentPass: (r, ctx) =>
      linkAgentPass(
        deps,
        requireUser(ctx),
        r,
        /^Bearer ([^\s]+)$/i.exec(
          ctx.requestHeader.get("authorization") ?? "",
        )?.[1] ?? "",
      ),
    claimCutoff: (r, ctx) =>
      claimCutoff(deps, requireUser(ctx), nightKey(r.night)),
    listCutoffClaims: (_, ctx) => listCutoffClaims(deps, requireUser(ctx)),
    prepareAsk: (r, ctx) =>
      (isChain(deps.ports) ? prepareChainAsk : prepareAsk)(
        deps,
        requireUser(ctx),
        nightKey(r.night),
        quantity(r.size),
        money(r.price),
        r.expiry,
      ),
    cancelAllAsks: (_, ctx) => cancelAllAsks(deps, requireUser(ctx)),
    discover: (r, ctx) => discover(deps, r, optionalUser(ctx)),
    getNight: (r) => getNight(deps, nightKey(r.night)),
    getBook: (r) =>
      isChain(deps.ports)
        ? chainBook(deps, nightKey(r.night))
        : getBook(deps, nightKey(r.night)),
    listTape: (r, ctx) =>
      listTape(deps, nightKey(r.night), optionalUser(ctx)?.id),
    quoteBuy: async (r, ctx) => ({
      slippageBps: isChain(deps.ports)
        ? (chainMarket(deps.ports).slippageBps ?? 50)
        : 50,
      quote: isChain(deps.ports)
        ? await quoteChainTrade(
            deps,
            nightKey(r.night),
            quantity(r.size),
            optionalUser(ctx),
            "buy",
          )
        : quoteBuy(
            deps,
            nightKey(r.night),
            quantity(r.size),
            optionalUser(ctx),
          ),
    }),
    quoteSell: async (r, ctx) => ({
      slippageBps: isChain(deps.ports)
        ? (chainMarket(deps.ports).slippageBps ?? 50)
        : 50,
      quote: isChain(deps.ports)
        ? await quoteChainTrade(
            deps,
            nightKey(r.night),
            quantity(r.size),
            optionalUser(ctx),
            "sell",
          )
        : quoteSell(
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
          requestId(
            deps,
            user.humanId,
            ctx.requestHeader.get("idempotency-key"),
          ),
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
          requestId(
            deps,
            user.humanId,
            ctx.requestHeader.get("idempotency-key"),
          ),
        ),
      }));
    },
    postAsk: (r, ctx) => {
      const user = requireUser(ctx);
      return deps.repo.exclusive(user.humanId, async () =>
        postAskWithCustody(
          deps,
          user,
          nightKey(r.night),
          quantity(r.size),
          money(r.price),
          {
            expiry: r.expiry,
            nonce: r.nonce,
            signature: r.signature,
            operationId: requestId(
              deps,
              user.humanId,
              ctx.requestHeader.get("idempotency-key"),
            ),
          },
        ),
      );
    },
    cancelAsk: (r, ctx) => {
      const user = requireUser(ctx);
      return deps.repo.exclusive(user.humanId, async () =>
        cancelAsk(deps, user, r.askId),
      );
    },
    getPortfolio: async (_, ctx) => {
      const user = requireUser(ctx);
      return {
        ...(isChain(deps.ports)
          ? await chainPortfolio(deps, user)
          : getPortfolio(deps, user)),
        agentWallet: (await getAgentWallet(deps, user)).wallet,
      };
    },
    getAgentWallet: (_, ctx) => getAgentWallet(deps, requireUser(ctx)),
    fundAgentWallet: (r, ctx) => {
      const user = requireUser(ctx);
      return deps.repo.exclusive(user.humanId, () =>
        transferAgentWallet(deps, user, money(r.amount)),
      );
    },
    withdrawAgentWallet: (r, ctx) => {
      const user = requireUser(ctx);
      return deps.repo.exclusive(user.humanId, () =>
        transferAgentWallet(deps, user, money(r.amount), true),
      );
    },
    setAgentBudget: (r, ctx) => {
      const user = requireUser(ctx);
      return deps.repo.exclusive(user.humanId, () =>
        setAgentBudget(
          deps,
          user,
          money(r.totalBudget),
          money(r.perOrderCap),
          r.allowedNights.map(nightKey),
        ),
      );
    },
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
    startAgentCheckpoint: (r, ctx) => {
      const user = requireUser(ctx);
      const token =
        /^Bearer ([^\s]+)$/i.exec(
          ctx.requestHeader.get("authorization") ?? "",
        )?.[1] ?? "";
      return deps.repo.exclusive(user.humanId, () =>
        startAgentCheckpoint(deps, user, r.orderId, token),
      );
    },
    getAgentCheckpoint: (r, ctx) =>
      getAgentCheckpoint(deps, requireUser(ctx), r.attemptId),
    approveAgentOrder: (r, ctx) => {
      const user = requireUser(ctx);
      return deps.repo.exclusive(user.humanId, () =>
        approveAgentOrder(deps, user, r.orderId, r.verificationToken),
      );
    },
  };
}

function requestId(deps: Deps, humanId: string, value: string | null) {
  if (!isChain(deps.ports) || value === null) return undefined;
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value))
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Invalid idempotency-key header.",
    );
  return `market:${chainMarket(deps.ports).reader.fingerprint}:${humanId}:${value}`;
}
