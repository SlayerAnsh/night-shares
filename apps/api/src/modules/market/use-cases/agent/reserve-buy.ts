import { type BuyResult, capOf, routeBuy } from "@night-shares/market-model";
import { transaction } from "../../../../db/transaction";
import type { User } from "../../../../ports/sessions/session-store";
import { DomainError } from "../../../../shared/errors/domain-error";
import { mulTenths } from "../../../../shared/money";
import { toWholeTenths } from "../../../../shared/tenths";
import { applyPoolBuy } from "../../../inventory/mutations/apply-pool-buy";
import { applyTraderAskFill } from "../../../inventory/mutations/apply-trader-ask-fill";
import { cutoffAt } from "../../cutoff";
import { buyQuote } from "../../mappers/route";
import { agentWallets } from "../../repo/agent-wallets.sqlite";
import {
  assertOpen,
  bookOf,
  type Deps,
  quantity,
  syncPosition,
} from "../context";
import { humanWallets } from "../human-wallets";
export function reserveAgentBuy(
  deps: Deps,
  user: User,
  key: string,
  size: number,
  max: bigint,
) {
  quantity({ tenths: size });
  const { ports } = deps;
  return transaction(ports.db, () => {
    let result: BuyResult | undefined;
    let used = 0;
    let before = ports.inventory.get(key);
    const record = ports.inventory.update(key, (current) => {
      before = current;
      assertOpen(ports, current);
      const position = syncPosition(deps, user, current);
      used = position.free + position.escrow;
      if (used + size > Math.floor(capOf(current.state.S) * 10 + 1e-9))
        throw new DomainError("FAILED_PRECONDITION", "Per-human cap exceeded.");
      result = routeBuy(
        bookOf(ports, current, humanWallets(ports, user, current.propertyId)),
        size / 10,
      );
      const quote = buyQuote(
        current,
        size,
        result,
        used,
        cutoffAt(ports, current),
      );
      if (toWholeTenths(result.filled) !== size)
        throw new DomainError(
          "FAILED_PRECONDITION",
          "Not enough trader liquidity.",
        );
      if ((quote.total?.micros ?? 0n) > max)
        throw new DomainError("FAILED_PRECONDITION", "Price moved.");
      let next = current;
      for (const fill of result.fills) {
        if (fill.src === "pool")
          next = applyPoolBuy(next, toWholeTenths(fill.take));
        if (fill.src === "trader")
          next = applyTraderAskFill(
            next,
            next.state.traderAsks.findIndex((a) => a.who === fill.who),
            toWholeTenths(fill.take),
          );
      }
      return next;
    });
    if (!result)
      throw new DomainError("FAILED_PRECONDITION", "Trade could not execute.");
    const quote = buyQuote(record, size, result, used, cutoffAt(ports, record));
    const position = deps.repo.position(user.humanId, key);
    const previousAverage = position.average;
    const total = quote.total?.micros ?? 0n;
    agentWallets(ports.db).reserve(user, key, total);
    position.average =
      ((mulTenths(position.average, used) + total) * 10n) / BigInt(used + size);
    position.free += size;
    return {
      record,
      result,
      used,
      before,
      quote,
      position,
      previousAverage,
      total,
    };
  });
}
