"use client";
import { useStaySearch } from "../../hooks/use-stay-search";
export function SearchFields() {
  const { state, update } = useStaySearch();
  return (
    <fieldset>
      <legend>Dates and guests</legend>
      <label>
        Check in{" "}
        <input
          type="date"
          value={state.checkIn}
          onChange={(e) => update({ checkIn: e.target.value })}
        />
      </label>{" "}
      <label>
        Check out{" "}
        <input
          type="date"
          min={state.checkIn}
          value={state.checkOut}
          onChange={(e) => update({ checkOut: e.target.value })}
        />
      </label>
      {(
        [
          ["adults", "Adults", 1, 16],
          ["kids", "Kids", 0, 8],
          ["rooms", "Rooms", 1, 8],
        ] as const
      ).map(([key, label, min, max]) => (
        <p key={key}>
          {label}{" "}
          <button
            type="button"
            aria-label={`Fewer ${label.toLowerCase()}`}
            disabled={state[key] <= min}
            onClick={() => update({ [key]: String(state[key] - 1) })}
          >
            −
          </button>{" "}
          <output>{state[key]}</output>{" "}
          <button
            type="button"
            aria-label={`More ${label.toLowerCase()}`}
            disabled={state[key] >= max}
            onClick={() => update({ [key]: String(state[key] + 1) })}
          >
            +
          </button>
        </p>
      ))}
    </fieldset>
  );
}
