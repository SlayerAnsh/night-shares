"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { readSearch, stayHref, validDates } from "../model/search";
export function useStaySearch() {
  const search = useSearchParams();
  const params = new URLSearchParams(search.toString());
  const pathname = usePathname();
  const router = useRouter();
  const state = readSearch(params);
  return {
    state,
    params,
    router,
    hasDates: validDates(state.checkIn, state.checkOut),
    update: (updates: Record<string, string>) =>
      router.replace(stayHref(pathname, params, updates), { scroll: false }),
    href: (path: string, updates: Record<string, string> = {}) =>
      stayHref(path, params, updates),
  };
}
