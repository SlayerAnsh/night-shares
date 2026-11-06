import { Icon } from "@night-shares/design-system";
import type { Destination } from "@night-shares/proto/catalog/v1/property_pb";
import { formatUsdc } from "../../../../shared/format";
import { plural } from "../../model/dates";
import { QueryState } from "../shared/QueryState";
import styles from "./SearchBar.module.css";

export function WhereList({
  query,
  destinations,
  error,
  onPick,
}: {
  query: string;
  destinations: Destination[];
  error: unknown;
  onPick: (city: string) => void;
}) {
  if (error) return <QueryState error={error} />;
  if (!destinations.length)
    return (
      <p className={styles.none}>No places match. Try “Bali” or “Paris”.</p>
    );
  return (
    <>
      <div className={styles.eyebrow}>
        {query ? "Matches" : "Popular right now"}
      </div>
      {destinations.map((d) => (
        <button
          key={`${d.city}-${d.country}`}
          type="button"
          className={styles.sug}
          onClick={() => onPick(d.city)}
        >
          <span className={styles.sugIcon}>
            <Icon name="pin" />
          </span>
          <span>
            <b>
              {d.city}, {d.country}
            </b>
            <span>
              {plural(d.stayCount, "stay")} · from{" "}
              {formatUsdc(d.fromPrice?.micros ?? 0n, { decimals: 0 })}
            </span>
          </span>
        </button>
      ))}
    </>
  );
}
