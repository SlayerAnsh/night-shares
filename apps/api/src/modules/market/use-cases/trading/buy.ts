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
import type { User } from "../../../../ports/sessions/session-store";
import { SYSTEM_ADDRESSES } from "../../../../ports/wallet-provider/wallet-provider";
import { DomainError } from "../../../../shared/errors/domain-error";
import { mulTenths } from "../../../../shared/money";
import { applyPoolBuy } from "../../../inventory/mutations/apply-pool-buy";
import { applyTraderAskFill } from "../../../inventory/mutations/apply-trader-ask-fill";
import { buyQuote } from "../../mappers/route";
import { assertOpen, bookOf, type Deps, syncPosition } from "../context";
export async function buy(
  deps: Deps,
  user: User,
  key: string,
  size: number,
  max: bigint,
) {
  const { ports } = deps;
  const balance = await ports.walletProvider.balance(user.walletAddress);
  const marketMaker = SYSTEM_ADDRESSES.marketMaker;
  let result: BuyResult | undefined;
  let used = 0;
  const record = ports.inventory.update(key, (current) => {
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
    if ((quote.total?.micros ?? 0n) > balance)
      throw new DomainError("FAILED_PRECONDITION", "Not enough USDC.");
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
  const total = quote.total?.micros ?? 0n;
  position.average =
    ((mulTenths(position.average, used) + total) * 10n) / BigInt(used + size);
  position.free += size;
  await settle(deps, user, key, result, marketMaker);
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
  const transfer: typeof ports.walletProvider.transfer = async (...args) =>
    args[2] === 0n ? "" : ports.walletProvider.transfer(...args);
  let remaining = toMicros(result.gross);
  for (const [index, fill] of result.fills.entries()) {
    const gross =
      index === result.fills.length - 1
        ? remaining
        : toMicros(askFillProceeds(fill.price, fill.take).gross);
    remaining -= gross;
    if (fill.src === "trader") {
      const fee = toMicros(fill.sellerFee ?? 0);
      await transfer(
        user.walletAddress,
        fill.who === "mm-bot" ? marketMaker : (fill.who ?? marketMaker),
        gross - fee,
        "ask fill",
      );
      await transfer(user.walletAddress, "treasury", fee, "seller fee");
      ports.activity.append({
        nightKey: key,
        propertyId: key.split(":")[0] ?? "",
        kind: "ask_filled",
        actor: "trader",
        tenths: toTenths(fill.take),
        priceMicros: toMicros(fill.price),
      });
    } else await transfer(user.walletAddress, "pool", gross, "market buy");
  }
  await transfer(
    user.walletAddress,
    "treasury",
    toMicros(result.fee),
    "buyer fee",
  );
}
