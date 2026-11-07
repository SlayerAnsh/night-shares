"use client";
import { useMutation, useQuery } from "@connectrpc/connect-query";
import * as rpc from "@night-shares/proto/market/v1/market-MarketService_connectquery";
import { useState } from "react";
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
  const [cancelling, setCancelling] = useState<{
    id: string;
    others: number;
  }>();
  return {
    portfolio,
    watch,
    level,
    actions,
    cancelling,
    // On chain one cancel revokes every signature the seller holds, then the
    // API signs the other listings again. `others` is how many that touches.
    cancel: async (askId: string, others = 0) => {
      setCancelling({ id: askId, others });
      try {
        await actions.run(
          () => cancel.mutateAsync({ askId }),
          "trade",
          cancelNotice(others),
        );
      } finally {
        setCancelling(undefined);
      }
    },
  };
}

/** After a cancel: why the seller's other listings are still there. */
export function cancelNotice(others: number) {
  if (others <= 0) return "Listing removed.";
  const rest = others === 1 ? "listing stays" : `${others} listings stay`;
  return `Listing removed. Your other ${rest} open. On chain, one cancel clears all your signed listings at once, so Night Shares signs the others again for you.`;
}
