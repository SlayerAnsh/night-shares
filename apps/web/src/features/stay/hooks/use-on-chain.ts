"use client";
import { useQueryClient } from "@tanstack/react-query";
import { staysOnChain } from "../model/on-chain";

// Read at render: the book card and calendar re-render whenever a quote lands.
export function useStaysOnChain(): boolean {
  const cache = useQueryClient();
  return staysOnChain(
    cache
      .getQueryCache()
      .getAll()
      .map((query) => ({ data: query.state.data, error: query.state.error })),
  );
}
