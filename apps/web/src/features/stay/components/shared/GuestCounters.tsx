"use client";
import { Button, Stepper } from "@night-shares/design-system";
import { useStaySearch } from "../../hooks/use-stay-search";
import styles from "./GuestCounters.module.css";

const ROWS = [
  ["adults", "Adults", "Ages 13+", 1, 16],
  ["kids", "Children", "Ages 0 to 12", 0, 8],
  ["rooms", "Rooms", "One room for each night of your stay", 1, 8],
] as const;

// Adults, children and rooms, written to the URL like every stay choice.
export function GuestCounters({ onDone }: { onDone?: () => void }) {
  const { state, update } = useStaySearch();
  return (
    <div>
      {ROWS.map(([key, label, hint, min, max]) => (
        <div key={key} className={styles.row}>
          <div>
            <b>{label}</b>
            <span>{hint}</span>
          </div>
          <Stepper
            label={label}
            value={state[key]}
            min={min}
            max={max}
            onChange={(value) => update({ [key]: String(value) })}
          />
        </div>
      ))}
      {onDone && (
        <Button
          variant="secondary"
          size="sm"
          block
          className={styles.done}
          onClick={onDone}
        >
          Done
        </Button>
      )}
    </div>
  );
}
