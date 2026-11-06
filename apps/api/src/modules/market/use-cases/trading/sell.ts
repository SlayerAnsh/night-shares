import { create } from "@bufbuild/protobuf";
import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import {
  ExecutionSchema,
  type RouteQuote,
} from "@night-shares/proto/market/v1/book_pb";
import type { User } from "../../../../ports/sessions/session-store";
import { DomainError } from "../../../../shared/errors/domain-error";
import { feePayments } from "../../../../shared/fee-payments";
import { applyPoolBuy } from "../../../inventory/mutations/apply-pool-buy";
import { applyPoolSell } from "../../../inventory/mutations/apply-pool-sell";
import { assertOpen, type Deps, realise, syncPosition } from "../context";
import { quoteSell } from "./quote-sell";
export async function sell(
  deps: Deps,
  user: User,
  key: string,
  size: number,
  min: bigint,
) {
  const { ports } = deps;
  let quote: RouteQuote | undefined;
  const record = ports.inventory.update(key, (current) => {
    assertOpen(ports, current);
    const position = syncPosition(deps, user, current);
    if (position.free < size)
      throw new DomainError(
        "FAILED_PRECONDITION",
        "Not enough unlisted room nights.",
      );
    quote = quoteSell(deps, key, size, user, current);
    if (
      quote.filled?.tenths !== size ||
      size > Math.round(current.state.held * 10)
    )
      throw new DomainError(
        "FAILED_PRECONDITION",
        "Not enough sell-back liquidity.",
      );
    if ((quote.total?.micros ?? 0n) < min)
      throw new DomainError("FAILED_PRECONDITION", "Price moved.");
    return applyPoolSell(current, size);
  });
  if (!quote)
    throw new DomainError("FAILED_PRECONDITION", "Trade could not execute.");
  const position = deps.repo.position(user.humanId, key);
  const previous = { ...position };
  position.free -= size;
  realise(position, size, quote.total?.micros ?? 0n);
  const reserved = { ...position };
  try {
    await ports.walletProvider.settle(
      [
        {
          from: "pool",
          to: user.walletAddress,
          amount: quote.total?.micros ?? 0n,
          memo: "sell back",
        },
        ...feePayments(quote.gross?.micros ?? 0n, quote.fee?.micros ?? 0n).map(
          (payment) => ({
            from: "pool",
            ...payment,
            memo: "sell-back fee",
          }),
        ),
      ].filter((leg) => leg.amount > 0n),
    );
  } catch (error) {
    ports.inventory.update(key, (current) => applyPoolBuy(current, size));
    position.free += size;
    position.realised += previous.realised - reserved.realised;
    position.closed += previous.closed - reserved.closed;
    position.wins += previous.wins - reserved.wins;
    position.returns += previous.returns - reserved.returns;
    throw error;
  }
  ports.activity.append({
    nightKey: key,
    propertyId: record.propertyId,
    kind: "trader_sold_back",
    actor: "pool",
    userId: user.id,
    tenths: size,
    priceMicros: quote.average?.micros,
  });
  return create(ExecutionSchema, {
    id: ports.ids.next("ord"),
    quote,
    executedAt: timestampFromMs(ports.clock.now()),
  });
}
