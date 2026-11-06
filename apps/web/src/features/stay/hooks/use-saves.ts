"use client";
import { useMutation, useQuery } from "@connectrpc/connect-query";
import {
  listSaves,
  toggleSave,
} from "@night-shares/proto/stay/v1/stay-StayService_connectquery";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useRequireAccess } from "../../../session/require-access";
import { useSession } from "../../../session/SessionProvider";
import { useStaySearch } from "./use-stay-search";
export function useSaves() {
  const session = useSession();
  const access = useRequireAccess();
  const cache = useQueryClient();
  const { params, update } = useStaySearch();
  const query = useQuery(listSaves, {}, { enabled: session.isSignedIn });
  const mutation = useMutation(toggleSave, {
    onSuccess: () => cache.invalidateQueries(),
  });
  const resumed = useRef(false);
  const pending = params.get("save");
  async function save(propertyId: string) {
    if (!session.isSignedIn) {
      const url = new URL(window.location.href);
      url.searchParams.set("save", propertyId);
      window.history.replaceState(null, "", url);
    }
    if (!access.require("save", "device")) return;
    try {
      await mutation.mutateAsync({ propertyId });
    } finally {
      update({ save: "" });
    }
  }
  useEffect(() => {
    if (pending && session.isSignedIn && !resumed.current) {
      resumed.current = true;
      void save(pending).catch(() => {});
    }
  });
  return {
    query,
    mutation,
    save,
    isSaved: (id: string) =>
      query.data?.properties.some((p) => p.id === id) ?? false,
  };
}
