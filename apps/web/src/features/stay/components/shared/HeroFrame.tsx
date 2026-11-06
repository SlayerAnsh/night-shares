import { type ReactNode, Suspense } from "react";
import { SearchHero, SearchHeroShell } from "../hero/SearchHero";

// Stay's nav is transparent over a photo, so route fallbacks (error, not
// found) keep the compact hero and its search bar above their message.
export function HeroFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<SearchHeroShell compact />}>
        <SearchHero compact />
      </Suspense>
      <div>{children}</div>
    </>
  );
}
