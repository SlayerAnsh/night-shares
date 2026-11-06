import { create } from "@bufbuild/protobuf";
import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import {
  askFillProceeds,
  type BuyResult,
  capOf,
  routeBuy,
  toMicros,
  toTenths,
} from "@night-shares/market-model";
import { ExecutionSchema } from "@night-shares/proto/market/v1/book_pb";
import { transaction } from "../../../../db/transaction";
import type { User } from "../../../../ports/sessions/session-store";
import { SYSTEM_ADDRESSES } from "../../../../ports/wallet-provider/wallet-provider";
import { DomainError } from "../../../../shared/errors/domain-error";
import { feePayments } from "../../../../shared/fee-payments";
import { mulTenths } from "../../../../shared/money";
import { applyPoolBuy } from "../../../inventory/mutations/apply-pool-buy";
import { applyTraderAskFill } from "../../../inventory/mutations/apply-trader-ask-fill";
import { buyQuote } from "../../mappers/route";
import { assertOpen, bookOf, type Deps, syncPosition } from "../context";
import { revertFills } from "./revert-fills";
export async function buy(
  deps: Deps,
  user: User,
  key: string,
  size: number,
  max: bigint,
) {
  const { ports } = deps;
  const marketMaker = SYSTEM_ADDRESSES.marketMaker;
  const {
    record,
    result,
    used,
    before,
    quote,
    position,
    previousAverage,
    total,
  } = transaction(ports.db, () => {
    let result: BuyResult | undefined;
    let used = 0;
    let before = ports.inventory.get(key);
    const record = ports.inventory.update(key, (current) => {
      before = current;
      assertOpen(ports, current);
      const position = syncPosition(deps, user, current);
      used = position.free + position.escrow;
      if (used + size > toTenths(capOf(current.state.S, current.state.peak)))
        throw new DomainError("FAILED_PRECONDITION", "Per-human cap exceeded.");
      result = routeBuy(bookOf(ports, current, user.walletAddress), size / 10);
      const quote = buyQuote(current, size, result, used);
      if (toTenths(result.filled) !== size)
        throw new DomainError(
          "FAILED_PRECONDITION",
          "Not enough trader liquidity.",
        );
      if ((quote.total?.micros ?? 0n) > max)
        throw new DomainError("FAILED_PRECONDITION", "Price moved.");
      let next = current;
      for (const fill of result.fills) {
        if (fill.src === "pool") next = applyPoolBuy(next, toTenths(fill.take));
        if (fill.src === "trader")
          next = applyTraderAskFill(
            next,
            next.state.traderAsks.findIndex((a) => a.who === fill.who),
            toTenths(fill.take),
          );
      }
      return next;
    });
    if (!result)
      throw new DomainError("FAILED_PRECONDITION", "Trade could not execute.");
    const quote = buyQuote(record, size, result, used);
    const position = deps.repo.position(user.humanId, key);
    const previousAverage = position.average;
    const total = quote.total?.micros ?? 0n;
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
  try {
    await settle(deps, user, key, result, marketMaker);
  } catch (error) {
    transaction(ports.db, () => {
      ports.inventory.update(key, (current) =>
        revertFills(current, result as BuyResult, before),
      );
      const held = position.free + position.escrow;
      const cost = mulTenths(position.average, held) - total;
      position.free -= size;
      position.average =
        held === used + size
          ? previousAverage
          : held === size
            ? 0n
            : (cost * 10n) / BigInt(held - size);
    });
    throw error;
  }
  ports.activity.append({
    nightKey: key,
    propertyId: record.propertyId,
    kind: "trader_bought",
    actor: "trader",
    userId: user.id,
    tenths: size,
    priceMicros: toMicros(result.avg),
  });
  return create(ExecutionSchema, {
    id: ports.ids.next("ord"),
    quote,
    executedAt: timestampFromMs(ports.clock.now()),
  });
}
async function settle(
  { ports }: Deps,
  user: User,
  key: string,
  result: BuyResult,
  marketMaker: string,
) {
  const legs: Parameters<typeof ports.walletProvider.settle>[0] = [];
  const transfer = (from: string, to: string, amount: bigint, memo: string) => {
    if (amount > 0n) legs.push({ from, to, amount, memo });
  };
  let remaining = toMicros(result.gross);
  for (const [index, fill] of result.fills.entries()) {
    const gross =
      index === result.fills.length - 1
        ? remaining
        : toMicros(askFillProceeds(fill.price, fill.take).gross);
    remaining -= gross;
    if (fill.src === "trader") {
      const fee = toMicros(fill.sellerFee ?? 0);
      transfer(
        user.walletAddress,
        fill.who === "mm-bot" ? marketMaker : (fill.who ?? marketMaker),
        gross - fee,
        "ask fill",
      );
      for (const payment of feePayments(gross, fee))
        transfer(user.walletAddress, payment.to, payment.amount, "seller fee");
    } else transfer(user.walletAddress, "pool", gross, "market buy");
  }
  for (const payment of feePayments(
    toMicros(result.gross),
    toMicros(result.fee),
  ))
    transfer(user.walletAddress, payment.to, payment.amount, "buyer fee");
  await ports.walletProvider.settle(legs);
  for (const fill of result.fills) {
    if (fill.src === "trader") {
      ports.activity.append({
        nightKey: key,
        propertyId: key.split(":")[0] ?? "",
        kind: "ask_filled",
        actor: "trader",
        tenths: toTenths(fill.take),
        priceMicros: toMicros(fill.price),
      });
    }
  }
}
