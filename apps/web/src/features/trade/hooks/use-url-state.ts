"use client";
import { usePathname, useSearchParams } from "next/navigation";
export function useUrlState() {
  const params = useSearchParams();
  const pathname = usePathname();
  function update(values: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(values))
      value ? next.set(key, value) : next.delete(key);
    window.history.replaceState(null, "", `${pathname}?${next}`);
  }
  return { params, update };
}
