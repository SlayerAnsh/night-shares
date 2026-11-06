import type { Property } from "@night-shares/proto/catalog/v1/property_pb";
import type { useOpening } from "../../hooks/use-opening";
import { usd } from "../../model/money";
import { Seg } from "../ui/Seg";
import styles from "./Panel.module.css";

const MODES = [
  ["range", "Date range"],
  ["picked", "Picked nights"],
] as const;

/** Which nights and which room types to open. */
export function OpeningFields({
  property,
  opening: o,
  rateFor,
}: {
  property: Property;
  opening: ReturnType<typeof useOpening>;
  rateFor: (roomTypeId: string) => bigint | undefined;
}) {
  return (
    <>
      <div className={styles.fld}>
        <div className={styles.fh}>
          <b>Nights</b>
          <span>{o.dates.length} selected</span>
        </div>
        <Seg
          label="Choose dates"
          options={MODES}
          value={o.mode === "picked" ? "picked" : "range"}
          full
          onChange={(mode) => o.set({ mode })}
        />
        {o.mode === "picked" ? (
          <p className={styles.help}>
            Pick nights on the calendar. Shift click picks a range.
          </p>
        ) : (
          <div className={styles.dates}>
            <label>
              From
              <input
                className={styles.input}
                type="date"
                value={o.start}
                onChange={(e) => o.set({ from: e.target.value })}
              />
            </label>
            <label>
              Until (exclusive)
              <input
                className={styles.input}
                type="date"
                value={o.end}
                onChange={(e) => o.set({ to: e.target.value })}
              />
            </label>
          </div>
        )}
      </div>
      <div className={styles.fld}>
        <div className={styles.fh}>
          <b>Room types</b>
        </div>
        <div className={styles.chks}>
          {property.roomTypes.map((room) => {
            const rate = rateFor(room.id);
            return (
              <label key={room.id} className={styles.chk}>
                <input
                  type="checkbox"
                  checked={o.selection.roomTypeIds.includes(room.id)}
                  onChange={() => o.toggleRoom(room.id)}
                />
                <span className={styles.grow}>
                  <b>{room.name}</b>
                  <small>{room.spec}</small>
                </span>
                {rate !== undefined && (
                  <span className={styles.rate}>{usd(rate)}</span>
                )}
              </label>
            );
          })}
        </div>
      </div>
    </>
  );
}
