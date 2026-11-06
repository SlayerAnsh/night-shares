import type { Property } from "@night-shares/proto/catalog/v1/property_pb";
import {
  DemandPreset,
  ReleasePolicy,
} from "@night-shares/proto/host/v1/opening_pb";
import type { useOpening } from "../../hooks/use-opening";
export function OpeningFields({
  property,
  opening: o,
  disabled,
}: {
  property: Property;
  opening: ReturnType<typeof useOpening>;
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend>Nights and room types</legend>
      <label>
        Choose dates{" "}
        <select
          value={o.mode}
          onChange={(e) => o.set({ mode: e.target.value })}
        >
          <option value="range">Date range</option>
          <option value="picked">Picked dates</option>
        </select>
      </label>
      {o.mode === "range" ? (
        <>
          <label>
            From{" "}
            <input
              type="date"
              value={o.start}
              onChange={(e) => o.set({ from: e.target.value })}
            />
          </label>
          <label>
            Until (exclusive){" "}
            <input
              type="date"
              value={o.end}
              onChange={(e) => o.set({ to: e.target.value })}
            />
          </label>
        </>
      ) : (
        <p>Pick nights using the calendar checkboxes.</p>
      )}
      <p>
        {o.dates.length} nights selected
        {o.dates.length > 0 ? `: ${o.dates.join(", ")}` : ""}
      </p>
      {property.roomTypes.map((room) => (
        <label key={room.id}>
          <input
            type="checkbox"
            checked={o.selection.roomTypeIds.includes(room.id)}
            onChange={() => o.toggleRoom(room.id)}
          />
          {room.name}
        </label>
      ))}
      <label>
        Rooms offered (%){" "}
        <input
          type="number"
          min={10}
          max={100}
          step={10}
          required
          value={o.selection.allotmentPercent}
          onChange={(e) => o.set({ percent: e.target.value })}
        />
      </label>
      <label>
        Demand{" "}
        <select
          value={o.selection.demandPreset}
          onChange={(e) => o.set({ demand: e.target.value })}
        >
          <option value={DemandPreset.CALM}>Calm</option>
          <option value={DemandPreset.NORMAL}>Normal</option>
          <option value={DemandPreset.PEAK}>Peak</option>
        </select>
      </label>
      <label>
        Release time{" "}
        <select
          value={o.selection.releasePolicy}
          onChange={(e) => o.set({ release: e.target.value })}
        >
          <option value={ReleasePolicy.ARRIVAL_14}>Day of arrival, 2 pm</option>
          <option value={ReleasePolicy.DAY_BEFORE_18}>
            Day before arrival, 6 pm
          </option>
          <option value={ReleasePolicy.THREE_DAYS_BEFORE_12}>
            Three days before arrival, noon
          </option>
        </select>
      </label>
    </fieldset>
  );
}
