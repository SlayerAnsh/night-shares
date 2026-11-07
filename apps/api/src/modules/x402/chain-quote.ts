import { book, routeBuy, toMicros, toTenths } from "@night-shares/market-model";
import type { RouteQuote } from "@night-shares/proto/market/v1/book_pb";
import { keccak256, stringToHex } from "viem";
import {
  type Ask,
  type NightConfig,
  tokenTenths,
} from "../../ports/chain-executor/chain-executor";
import type { ChainReader } from "../../ports/chain-reader/chain-reader";
import { DomainError } from "../../shared/errors/domain-error";
import { parse } from "../../shared/night-key";

export type ChainBuyQuote = { total: bigint; fills: number; asks: Ask[] };
export type ChainQuoteDeps =
  | {
      mode: "chain";
      reader: Pick<ChainReader, "head" | "read" | "assertCurrent">;
      // The existing signed-order path supplies live, verified orders with remaining quantities.
      signedAsks(nightKey: string): Promise<Ask[]>;
    }
  | {
      mode: "mock";
      quoteBuy(
        nightKey: string,
        tenths: number,
      ):
        | Pick<RouteQuote, "total" | "filled">
        | Promise<Pick<RouteQuote, "total" | "filled">>;
    };
export async function quoteChainBuy(
  deps: ChainQuoteDeps,
  nightKey: string,
  tenths: number,
): Promise<ChainBuyQuote> {
  parse(nightKey);
  if (!Number.isSafeInteger(tenths) || tenths <= 0)
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Quantity must be positive integer tenths.",
    );
  if (deps.mode === "mock") {
    const quote = await deps.quoteBuy(nightKey, tenths);
    if (!quote.total || !quote.filled)
      throw new Error("QuoteBuy returned an incomplete quote.");
    return { total: quote.total.micros, fills: quote.filled.tenths, asks: [] };
  }
  const { reader } = deps;
  await reader.assertCurrent();
  const head = await reader.head();
  const night = keccak256(stringToHex(nightKey));
  const get = async <T>(
    contract: string,
    functionName: string,
    args: readonly unknown[] = [],
  ) =>
    (await reader.read<T>({ contract, functionName, args, night }, head.number))
      .value;
  const [config, released, burned, candidates] = await Promise.all([
    get<NightConfig>("NightFactory", "config", [night]),
    get<bigint>("NightToken", "released"),
    get<bigint>("NightToken", "burned"),
    deps.signedAsks(nightKey),
  ]);
  const balances = new Map<string, bigint>();
  const asks: Ask[] = [];
  for (const ask of [...candidates].sort((a, b) =>
    a.order.price < b.order.price ? -1 : a.order.price > b.order.price ? 1 : 0,
  )) {
    if (
      ask.order.night !== night ||
      ask.order.expiry <= head.timestamp ||
      ask.qty <= 0n
    )
      continue;
    const maker = ask.order.maker.toLowerCase();
    const balance =
      balances.get(maker) ??
      (await get<bigint>("NightToken", "balanceOf", [ask.order.maker]));
    let available = ask.qty;
    if (available > ask.order.size) available = ask.order.size;
    if (available > balance) available = balance;
    const qty = (available / tokenTenths(1)) * tokenTenths(1);
    balances.set(maker, balance - qty);
    if (qty > 0n) asks.push({ ...ask, qty });
  }
  const result = routeBuy(
    book({
      F: Number(config.F) / 1e6,
      k: Number(config.k) / 1e18,
      S: Number(config.S),
      q: Number(released + burned) / 1e18,
      levels: tenths,
      traderAsks: asks.map((ask, index) => ({
        price: Number(ask.order.price) / 1e6,
        size: Number(ask.qty) / 1e18,
        who: String(index),
      })),
    }),
    tenths / 10,
  );
  const selected: Ask[] = [];
  for (const fill of result.fills) {
    if (fill.src !== "trader") continue;
    const ask = asks[Number(fill.who)];
    if (ask) selected.push({ ...ask, qty: tokenTenths(toTenths(fill.take)) });
  }
  return {
    total: toMicros(result.gross) + toMicros(result.fee),
    fills: toTenths(result.filled),
    asks: selected,
  };
}
