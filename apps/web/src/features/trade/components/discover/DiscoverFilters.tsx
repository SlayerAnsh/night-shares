import { Segmented } from "@night-shares/design-system";
import { Toggle } from "../ui/Toggle";
import styles from "./discover.module.css";

type Filters = {
  city: string;
  valueOnly: boolean;
  soon: boolean;
  watchlist: boolean;
};

export function DiscoverFilters({
  filters,
  cities,
  change,
}: {
  filters: Filters;
  cities: string[];
  change: (key: string, value: string) => void;
}) {
  const options = [
    { value: "", label: "All" },
    ...cities.map((city) => ({ value: city, label: city })),
  ];
  if (filters.city && !cities.includes(filters.city))
    options.push({ value: filters.city, label: filters.city });
  const flag = (key: string) => (checked: boolean) =>
    change(key, checked ? "1" : "");
  return (
    <div className={styles.filters}>
      <Segmented
        size="sm"
        label="Location"
        options={options}
        value={filters.city}
        onChange={(city) => change("city", city)}
      />
      <fieldset className={styles.togs}>
        <legend className={styles.legend}>Show only</legend>
        <Toggle
          label="Below fair price"
          checked={filters.valueOnly}
          onChange={flag("value")}
        />
        <Toggle
          label="Releases soon"
          checked={filters.soon}
          onChange={flag("soon")}
        />
        <Toggle
          label="Watchlist"
          checked={filters.watchlist}
          onChange={flag("watchlist")}
        />
      </fieldset>
    </div>
  );
}
