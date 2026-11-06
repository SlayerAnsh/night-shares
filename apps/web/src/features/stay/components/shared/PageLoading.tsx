import { Skeleton } from "@night-shares/design-system";
import { SearchHeroShell } from "../hero/SearchHero";
import results from "../search/results/Results.module.css";
import { StayCardSkeleton } from "../search/results/StayCardSkeleton";
import styles from "./QueryState.module.css";

export type LoadingShape = "search" | "detail" | "trips" | "checkout";

// Route level fallback while a Stay screen reads its URL state: the page's
// own outline (hero, then cards, gallery or trip rows), not a spinner.
export function PageLoading({
  label,
  shape = "search",
}: {
  label: string;
  shape?: LoadingShape;
}) {
  return (
    <>
      {shape !== "checkout" && <SearchHeroShell compact={shape !== "search"} />}
      <div className={styles.page} role="status" aria-label={label}>
        {shape === "search" && (
          <div className={results.grid}>
            {[0, 1, 2].map((i) => (
              <StayCardSkeleton key={i} />
            ))}
          </div>
        )}
        {shape === "detail" && (
          <>
            <Skeleton
              height={56}
              width="min(520px, 80%)"
              radius="var(--r-12)"
            />
            <Skeleton height={360} radius="var(--r-lg)" />
          </>
        )}
        {shape === "trips" && (
          <>
            <Skeleton
              height={56}
              width="min(320px, 70%)"
              radius="var(--r-12)"
            />
            <Skeleton height={170} radius="var(--r-lg)" />
            <Skeleton height={170} radius="var(--r-lg)" />
          </>
        )}
        {shape === "checkout" && <Skeleton height={480} radius="var(--r-lg)" />}
      </div>
    </>
  );
}
