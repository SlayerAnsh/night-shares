"use client";
import { Alert } from "@night-shares/design-system";
import { useSearchResults } from "../../hooks/use-search-results";
import { SearchHero } from "../hero/SearchHero";
import { QueryState } from "../shared/QueryState";
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
          <QueryState error={results.error} />
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
