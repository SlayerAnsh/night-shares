"use client";
import { useQuery } from "@connectrpc/connect-query";
import type { NightKey } from "@night-shares/proto/common/v1/night_pb";
import * as rpc from "@night-shares/proto/market/v1/market-MarketService_connectquery";
import { parseMicros, parseTenths } from "../model/market";
import { priceLimit, quoteSlippageBps } from "../model/slippage";
import { useTradeTx } from "./use-trade-tx";
import { useUrlState } from "./use-url-state";
export function useTicket(
  night: Pick<NightKey, "propertyId" | "roomTypeId" | "date">,
) {
  const { params, update } = useUrlState();
  const mode =
    params.get("mode") === "sell"
      ? "sell"
      : params.get("mode") === "ask"
        ? "ask"
        : "buy";
  const amount = params.get("size") ?? "0.1";
  const price = params.get("price") ?? "";
  const tenths = parseTenths(amount);
  const micros = parseMicros(price);
  const input = { night, size: { tenths: tenths ?? 0 } };
  const buyQuote = useQuery(rpc.quoteBuy, input, {
    enabled: mode === "buy" && tenths !== null,
  });
  const sellQuote = useQuery(rpc.quoteSell, input, {
    enabled: mode === "sell" && tenths !== null,
  });
  const preview = mode === "sell" ? sellQuote : buyQuote;
  const quote = mode === "ask" ? undefined : preview.data?.quote;
  const tx = useTradeTx();
  // The limit sent with the order: the quote with the configured slippage.
  const limit =
    quote?.total && mode !== "ask"
      ? priceLimit(quote.total.micros, mode, quoteSlippageBps(preview.data))
      : undefined;
  async function submit() {
    if (tx.unresolved) return tx.checkAgain();
    if (tenths === null) return;
    if (mode === "ask" && micros !== null)
      await tx.send({ mode, input: { ...input, price: { micros } } });
    else if (limit !== undefined && mode === "buy")
      await tx.send({ mode, input: { ...input, maxTotal: { micros: limit } } });
    else if (limit !== undefined && mode === "sell")
      await tx.send({ mode, input: { ...input, minTotal: { micros: limit } } });
  }
  const valid =
    tenths !== null &&
    (mode === "ask"
      ? micros !== null
      : !!quote?.total &&
        (quote.filled?.tenths ?? 0) > 0 &&
        !preview.isFetching &&
        !preview.error);
  return {
    mode,
    amount,
    price,
    micros,
    update,
    quote,
    preview,
    tx,
    limit,
    valid,
    submit,
  };
}
