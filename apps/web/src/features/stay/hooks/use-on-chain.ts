"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import { staysOnChain } from "../model/on-chain";

export function useStaysOnChain(): boolean {
  const cache = useQueryClient().getQueryCache();
  const subscribe = useCallback(
    (notify: () => void) => cache.subscribe(notify),
    [cache],
  );
  const snapshot = useCallback(
    () =>
      staysOnChain(
        cache.getAll().map((query) => ({
          data: query.state.data,
          error: query.state.error,
        })),
      ),
    [cache],
  );
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
