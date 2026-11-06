import {
  DemandPreset,
  ReleasePolicy,
} from "@night-shares/proto/host/v1/opening_pb";
import type { CSSProperties } from "react";
import type { useOpening } from "../../hooks/use-opening";
import { isHoliday } from "../../model/calendar";
import { Seg } from "../ui/Seg";
import ui from "../ui/ui.module.css";
import styles from "./Panel.module.css";

const DEMAND = [
  [DemandPreset.CALM, "Calm"],
  [DemandPreset.NORMAL, "Normal"],
  [DemandPreset.PEAK, "Peak"],
] as const;
const DEMAND_NOTE: Record<number, string> = {
  [DemandPreset.CALM]:
    "Price rises gently as rooms sell. Good for quiet weekdays.",
  [DemandPreset.NORMAL]:
    "Price rises steadily as rooms sell. Good for most nights.",
  [DemandPreset.PEAK]:
    "Price climbs fast as rooms sell. For holidays and big events.",
};

/** How many rooms to offer, how fast the price rises and when unsold rooms come back. */
export function OpeningTerms({
  opening: o,
}: {
  opening: ReturnType<typeof useOpening>;
}) {
  const percent = o.selection.allotmentPercent;
  const demand = o.selection.demandPreset;
  const holiday = o.dates.some(isHoliday);
  return (
    <>
      <div className={styles.fld}>
        <div className={styles.fh}>
          <b>Allotment</b>
          <span>{percent}% of rooms</span>
        </div>
        <p className={styles.help}>
          Rooms per night you offer through Night Shares. The rest stay on your
          other channels.
        </p>
        <input
          className={styles.range}
          type="range"
          min={10}
          max={100}
          step={10}
          required
          value={percent}
          aria-label="Allotment, percent of rooms"
          style={{ "--p": `${((percent - 10) / 90) * 100}%` } as CSSProperties}
          onChange={(e) => o.set({ percent: e.target.value })}
        />
      </div>
      <div className={styles.fld}>
        <div className={styles.fh}>
          <b>Demand</b>
        </div>
        <Seg
          label="Demand"
          options={DEMAND}
          value={demand}
          full
          onChange={(value) => o.set({ demand: String(value) })}
        />
        <p className={ui.note}>{DEMAND_NOTE[demand]}</p>
        {holiday && (
          <div className={styles.suggest}>
            {demand === DemandPreset.PEAK
              ? "Peak suits your selection: it includes holiday nights."
              : "Your selection includes holiday nights. Peak is suggested."}
          </div>
        )}
      </div>
      <div className={styles.fld}>
        <div className={styles.fh}>
          <b>Release time</b>
        </div>
        <p className={styles.help}>
          When rooms still on sale go back to your own inventory.
        </p>
        <select
          className={styles.select}
          aria-label="Release time"
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
      </div>
    </>
  );
}
