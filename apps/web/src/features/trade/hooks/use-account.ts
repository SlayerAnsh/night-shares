"use client";
import { useMutation, useQuery } from "@connectrpc/connect-query";
import * as rpc from "@night-shares/proto/market/v1/market-MarketService_connectquery";
import { useSession } from "../../../session/SessionProvider";
import { useMarketActions } from "./use-market-actions";
export function useAccount() {
  const { level } = useSession();
  const portfolio = useQuery(
    rpc.getPortfolio,
    {},
    { enabled: level === "orb" },
  );
  const watch = useQuery(rpc.listWatch, {}, { enabled: level === "orb" });
  const cancel = useMutation(rpc.cancelAsk);
  const actions = useMarketActions();
  return {
    portfolio,
    watch,
    level,
    actions,
    cancel: (askId: string) =>
      actions.run(
        () => cancel.mutateAsync({ askId }),
        "trade",
        "Listing removed.",
      ),
  };
}
