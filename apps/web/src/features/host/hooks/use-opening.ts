"use client";
import { useQuery } from "@connectrpc/connect-query";
import type { Property } from "@night-shares/proto/catalog/v1/property_pb";
import { previewOpenNights } from "@night-shares/proto/host/v1/host-HostService_connectquery";
import {
  DemandPreset,
  ReleasePolicy,
} from "@night-shares/proto/host/v1/opening_pb";
import { useRequireAccess } from "../../../session/require-access";
import { datesBetween } from "../model/host-view";
import { useHostMutations } from "./use-host-data";
import { useHostSearch } from "./use-host-search";

export function useOpening(property: Property) {
  const { search, set } = useHostSearch();
  const mode = search.get("mode") ?? "range";
  const start = search.get("from") ?? "";
  const end = search.get("to") ?? "";
  const picked = (search.get("dates") ?? "").split(",").filter(Boolean);
  const dates = mode === "picked" ? picked : datesBetween(start, end);
  const roomTypeIds = search.has("rooms")
    ? (search.get("rooms") ?? "")
        .split(",")
        .filter((id) => property.roomTypes.some((room) => room.id === id))
    : property.roomTypes.map((room) => room.id);
  const selection = {
    propertyId: property.id,
    dates,
    roomTypeIds,
    allotmentPercent: Number(search.get("percent") ?? 50),
    demandPreset: Number(search.get("demand") ?? DemandPreset.NORMAL),
    releasePolicy: Number(search.get("release") ?? ReleasePolicy.ARRIVAL_14),
  };
  const valid =
    dates.length > 0 && dates.length <= 240 && roomTypeIds.length > 0;
  const preview = useQuery(
    previewOpenNights,
    { selection },
    { enabled: valid, retry: false },
  );
  const { open, stop } = useHostMutations();
  const access = useRequireAccess();
  function toggleDate(date: string) {
    const selected = dates.includes(date)
      ? dates.filter((value) => value !== date)
      : [...dates, date];
    set({ mode: "picked", dates: selected.sort().join(",") });
  }
  function toggleRoom(id: string) {
    const selected = roomTypeIds.includes(id)
      ? roomTypeIds.filter((value) => value !== id)
      : [...roomTypeIds, id];
    set({ rooms: selected.join(",") || "none" });
  }
  function openSelected() {
    if (
      valid &&
      preview.isSuccess &&
      !preview.isFetching &&
      access.require("host", "orb")
    )
      open.mutate({ selection });
  }
  function stopSelected() {
    if (valid && access.require("host", "orb"))
      stop.mutate({
        nights: dates.flatMap((date) =>
          roomTypeIds.map((roomTypeId) => ({
            propertyId: property.id,
            roomTypeId,
            date,
          })),
        ),
      });
  }
  return {
    mode,
    start,
    end,
    dates,
    selection,
    valid,
    preview,
    open,
    stop,
    set,
    toggleDate,
    toggleRoom,
    openSelected,
    stopSelected,
  };
}
