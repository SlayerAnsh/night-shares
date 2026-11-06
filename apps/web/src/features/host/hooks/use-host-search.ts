"use client";
import { useSearchParams } from "next/navigation";

export function useHostSearch() {
  const search = useSearchParams();
  function set(values: Record<string, string>) {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${params.size ? `?${params}` : ""}`,
    );
  }
  return { search, set };
}
