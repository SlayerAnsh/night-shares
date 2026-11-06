"use client";
import { useMutation, useQuery } from "@connectrpc/connect-query";
import type { NightKey } from "@night-shares/proto/common/v1/night_pb";
import * as rpc from "@night-shares/proto/market/v1/market-MarketService_connectquery";
import { parseMicros, parseTenths } from "../model/market";
import { useMarketActions } from "./use-market-actions";
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
  const buy = useMutation(rpc.buy),
    sell = useMutation(rpc.sell),
    ask = useMutation(rpc.postAsk);
  const actions = useMarketActions();
  async function submit() {
    if (tenths === null) return;
    await actions.run(
      async () => {
        if (mode === "ask" && micros !== null) {
          await ask.mutateAsync({ ...input, price: { micros } });
        } else if (quote?.total && mode === "buy")
          await buy.mutateAsync({ ...input, maxTotal: quote.total });
        else if (quote?.total && mode === "sell")
          await sell.mutateAsync({ ...input, minTotal: quote.total });
      },
      "trade",
      mode === "ask" ? "Listing posted." : "Trade executed.",
    );
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
    actions,
    valid,
    submit,
  };
}
