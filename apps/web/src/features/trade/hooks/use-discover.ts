"use client";
import { useQuery } from "@connectrpc/connect-query";
import { discover } from "@night-shares/proto/market/v1/market-MarketService_connectquery";
import { useRequireAccess } from "../../../session/require-access";
import { useSession } from "../../../session/SessionProvider";
import { useUrlState } from "./use-url-state";
export function useDiscover() {
  const { params, update } = useUrlState();
  const { level } = useSession();
  const access = useRequireAccess();
  const filters = {
    city: params.get("city") ?? "",
    sort: params.get("sort") === "risk" ? 2 : 1,
    valueOnly: params.get("value") === "1",
    soon: params.get("soon") === "1",
    watchlist: params.get("watchlist") === "1",
  };
  const gated = filters.watchlist && level !== "orb";
  const query = useQuery(discover, filters, { enabled: !gated });
  function change(key: string, value: string) {
    update({ [key]: value });
    if (key === "watchlist" && value === "1")
      access.require("watchlist", "orb");
  }
  return {
    filters,
    query,
    gated,
    change,
    // Back to every market: drops city, value, soon and watchlist filters.
    reset: () => update({ city: "", value: "", soon: "", watchlist: "" }),
    signIn: () => access.require("watchlist", "orb"),
  };
}
