"use client";
import Link from "next/link";
import { formatUsdc } from "../../../../shared/format";
import { useSaves } from "../../hooks/use-saves";
import { useSearchResults } from "../../hooks/use-search-results";
import { QueryState } from "../shared/QueryState";
import { SearchFields } from "../shared/SearchFields";
export function SearchScreen() {
  const { state, update, href, hasDates, destinations, results } =
    useSearchResults();
  const saves = useSaves();
  return (
    <section>
      <h1>Find your next stay</h1>
      <label>
        Where{" "}
        <input
          list="destinations"
          value={state.destination}
          onChange={(e) => update({ destination: e.target.value })}
        />
      </label>
      <datalist id="destinations">
        {destinations.data?.destinations.map((d) => (
          <option key={`${d.city}-${d.country}`} value={d.city}>
            {d.country} · {d.stayCount} stays · From{" "}
            {formatUsdc(d.fromPrice?.micros ?? 0n)}
          </option>
        ))}
      </datalist>
      <QueryState error={destinations.error} />
      <SearchFields />
      <label>
        Type{" "}
        <select
          value={state.type}
          onChange={(e) => update({ type: e.target.value })}
        >
          {["All", "Beach", "City", "Jungle", "Mountains"].map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      </label>{" "}
      <label>
        Sort{" "}
        <select
          value={state.sort}
          onChange={(e) => update({ sort: e.target.value })}
        >
          {[
            ["rec", "Recommended"],
            ["lo", "Price: low to high"],
            ["hi", "Price: high to low"],
            ["rate", "Top rated"],
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {(state.checkIn || state.checkOut) && !hasDates ? (
        <p role="alert">Choose valid dates with check out after check in.</p>
      ) : (
        <>
          <QueryState pending={results.isPending} error={results.error} />
          {results.data && <p>{results.data.stays.length} stays</p>}
          <ul>
            {results.data?.stays.map(
              (card) =>
                card.property && (
                  <li key={card.property.id}>
                    <h2>
                      <Link href={href(`/stay/${card.property.id}`)}>
                        {card.property.name}
                      </Link>
                    </h2>
                    <p>
                      {card.property.city}, {card.property.country} ·{" "}
                      {card.property.rating} ({card.property.reviews} reviews)
                    </p>
                    <p>
                      {hasDates
                        ? `${formatUsdc(card.total?.micros ?? 0n)} total · `
                        : "From "}
                      {formatUsdc(card.average?.micros ?? 0n)} average per night
                    </p>
                    {card.isDeal && <p>Deal</p>}
                    {card.property.popular && <p>Popular</p>}
                    <button
                      type="button"
                      disabled={saves.mutation.isPending}
                      aria-pressed={saves.isSaved(card.property.id)}
                      onClick={() =>
                        void saves.save(card.property?.id ?? "").catch(() => {})
                      }
                    >
                      {saves.isSaved(card.property.id) ? "Saved" : "Save"}
                    </button>
                  </li>
                ),
            )}
          </ul>
        </>
      )}
      <QueryState error={saves.mutation.error || saves.query.error} />
    </section>
  );
}
