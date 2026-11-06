"use client";
import { Alert } from "@night-shares/design-system";
import { ErrorState } from "../../../../shared/fallback/ErrorState";
import { useSearchResults } from "../../hooks/use-search-results";
import { SearchHero } from "../hero/SearchHero";
import { ResultsBar } from "./results/ResultsBar";
import { StayGrid } from "./results/StayGrid";
import styles from "./SearchScreen.module.css";

export function SearchScreen() {
  const { state, update, hasDates, results } = useSearchResults();
  const halfDates = (state.checkIn || state.checkOut) && !hasDates;
  return (
    <>
      <SearchHero />
      <div className={styles.wrap} id="results">
        <ResultsBar count={results.data?.stays.length} />
        {halfDates ? (
          <Alert>Choose valid dates with check out after check in.</Alert>
        ) : results.error ? (
          <ErrorState
            error={results.error}
            thing="These stays"
            onRetry={() => void results.refetch()}
            retrying={results.isFetching}
          />
        ) : (
          <StayGrid
            stays={results.data?.stays}
            onReset={() => update({ destination: "", type: "" })}
          />
        )}
      </div>
    </>
  );
}
