"use client";
import { Chip, Select } from "@night-shares/design-system";
import { useStaySearch } from "../../../hooks/use-stay-search";
import { formatShort, plural } from "../../../model/dates";
import styles from "./Results.module.css";

const TYPES = ["All", "Beach", "City", "Jungle", "Mountains"];
const SORTS = [
  ["rec", "Recommended"],
  ["lo", "Price: low to high"],
  ["hi", "Price: high to low"],
  ["rate", "Top rated"],
] as const;

// Type chips, result count and sort, as in the mock's results bar.
export function ResultsBar({ count }: { count?: number }) {
  const { state, update, hasDates } = useStaySearch();
  return (
    <div className={styles.bar}>
      {TYPES.map((type) => (
        <Chip
          key={type}
          on={state.type === type}
          onClick={() => update({ type })}
        >
          {type}
        </Chip>
      ))}
      <span className={styles.count} role="status">
        {count !== undefined && plural(count, "stay")}
        {count !== undefined && state.destination && ` in ${state.destination}`}
        {count !== undefined &&
          hasDates &&
          ` · ${formatShort(state.checkIn)} → ${formatShort(state.checkOut)}`}
      </span>
      <Select
        aria-label="Sort"
        className={styles.sort}
        value={state.sort}
        onChange={(e) => update({ sort: e.target.value })}
      >
        {SORTS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
    </div>
  );
}
