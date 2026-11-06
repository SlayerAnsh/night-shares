"use client";
import { useMutation, useQuery } from "@connectrpc/connect-query";
import type { NightKey } from "@night-shares/proto/common/v1/night_pb";
import * as rpc from "@night-shares/proto/market/v1/market-MarketService_connectquery";
import { useSession } from "../../../session/SessionProvider";
import { nightHref } from "../model/market";
import { useMarketActions } from "./use-market-actions";
export function useNight(
  night: Pick<NightKey, "propertyId" | "roomTypeId" | "date">,
) {
  const { level } = useSession();
  const detail = useQuery(rpc.getNight, { night });
  const book = useQuery(rpc.getBook, { night });
  const tape = useQuery(rpc.listTape, { night });
  const watch = useQuery(rpc.listWatch, {}, { enabled: level === "orb" });
  const toggle = useMutation(rpc.toggleWatch);
  const actions = useMarketActions();
  const watched =
    watch.data?.nights.some(
      (card) => card.night && nightHref(card.night) === nightHref(night),
    ) ?? false;
  return {
    detail,
    book,
    tape,
    watch,
    watched,
    actions,
    toggle: () =>
      actions.run(
        () => toggle.mutateAsync({ night }),
        "watchlist",
        watched ? "Removed from your watchlist." : "Added to your watchlist.",
      ),
  };
}
