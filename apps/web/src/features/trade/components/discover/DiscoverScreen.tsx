"use client";
import { useDiscover } from "../../hooks/use-discover";
import { Feedback } from "../shared/Feedback";
import { NightCards } from "../shared/NightCards";
export function DiscoverScreen() {
  const { filters, query, gated, change, signIn } = useDiscover();
  return (
    <>
      <h1>Discover</h1>
      <form onSubmit={(event) => event.preventDefault()}>
        <label>
          City{" "}
          <input
            value={filters.city}
            onChange={(event) => change("city", event.target.value)}
          />
        </label>{" "}
        <label>
          Sort{" "}
          <select
            value={filters.sort === 2 ? "risk" : "return"}
            onChange={(event) => change("sort", event.target.value)}
          >
            <option value="return">Est. return</option>
            <option value="risk">Risk</option>
          </select>
        </label>
        {[
          ["value", "Below fair price", filters.valueOnly],
          ["soon", "Releases soon", filters.soon],
          ["watchlist", "Watchlist", filters.watchlist],
        ].map(([key, label, checked]) => (
          <label key={String(key)}>
            {" "}
            <input
              type="checkbox"
              checked={Boolean(checked)}
              onChange={(event) =>
                change(String(key), event.target.checked ? "1" : "")
              }
            />
            {label}
          </label>
        ))}
      </form>
      {gated ? (
        <button type="button" onClick={signIn}>
          Sign in with World ID to see your watchlist
        </button>
      ) : (
        <>
          {query.isPending && <p>Loading nights…</p>}
          <Feedback error={query.error?.message} />
          {query.data && <NightCards nights={query.data.nights} />}
        </>
      )}
    </>
  );
}
