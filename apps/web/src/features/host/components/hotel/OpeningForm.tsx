"use client";
import { useQuery } from "@connectrpc/connect-query";
import {
  Alert,
  Badge,
  buttonClass,
  cx,
  Icon,
  Spinner,
} from "@night-shares/design-system";
import type { Property } from "@night-shares/proto/catalog/v1/property_pb";
import { discover } from "@night-shares/proto/market/v1/market-MarketService_connectquery";
import { useEffect } from "react";
import type { useOpening } from "../../hooks/use-opening";
import { addDays, dayMonth, shortNight } from "../../model/calendar";
import { ErrorNote } from "../ui/QueryState";
import ui from "../ui/ui.module.css";
import { OpeningFields } from "./OpeningFields";
import { OpeningPreview } from "./OpeningPreview";
import { OpeningTerms } from "./OpeningTerms";
import styles from "./Panel.module.css";

function title(dates: string[]) {
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) return "Choose nights";
  if (dates.length === 1) return shortNight(first);
  const contiguous = dates.every(
    (d, i) => !i || addDays(dates[i - 1] ?? d, 1) === d,
  );
  return contiguous
    ? `${dayMonth(first)} to ${dayMonth(last)}`
    : `${dates.length} nights`;
}

/** Open nights panel: a side panel on desktop, a bottom sheet below 1180px. */
export function OpeningForm({
  property,
  opening: o,
  rateFor,
  onClose,
}: {
  property: Property;
  opening: ReturnType<typeof useOpening>;
  rateFor: (roomTypeId: string) => bigint | undefined;
  onClose: () => void;
}) {
  const status = useQuery(discover, { soon: true }, { refetchInterval: 15000 });
  const paused = status.data?.tradingPaused ?? false;
  const pending = o.open.isPending;
  const dates = [...o.dates].sort();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <aside
      id="open-nights"
      className={cx(ui.card, styles.panel)}
      aria-label="Open nights"
    >
      <div className={cx(styles.sec, styles.top)}>
        <div>
          <div className={ui.lbl}>
            {dates.length} {dates.length === 1 ? "night" : "nights"} selected
          </div>
          <div className={styles.title}>{title(dates)}</div>
        </div>
        <button
          type="button"
          className={ui.ib}
          aria-label="Clear selection"
          onClick={onClose}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      {paused && (
        <Alert>
          <Badge>Trading paused</Badge>
        </Alert>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!paused) o.openSelected();
        }}
      >
        <fieldset className={styles.sec} disabled={pending || paused}>
          <h3>Open nights</h3>
          <p className={styles.help}>
            Room types and usual rates come from your channel manager.
          </p>
          <OpeningFields property={property} opening={o} rateFor={rateFor} />
          <OpeningTerms opening={o} />
          {!o.valid && (
            <p className={styles.status}>
              Select nights and room types. A selection holds 1 to 240 nights.
            </p>
          )}
          {o.valid && o.preview.isFetching && (
            <p className={styles.status} role="status">
              <Spinner className={ui.spin} /> Updating preview
            </p>
          )}
          <ErrorNote error={o.valid ? o.preview.error : null} />
          {o.valid && o.preview.data && (
            <OpeningPreview property={property} preview={o.preview.data} />
          )}
          <div className={styles.actions}>
            <button
              type="submit"
              className={buttonClass({ variant: "primary" })}
              disabled={
                paused ||
                pending ||
                !o.valid ||
                !o.preview.isSuccess ||
                o.preview.isFetching
              }
            >
              {pending && <Spinner className={ui.spin} />}
              Open {dates.length} {dates.length === 1 ? "night" : "nights"}
            </button>
          </div>
          <ErrorNote error={o.open.error} />
          {o.open.data && (
            <p className={styles.done} role="status">
              Opened {o.open.data.nights.length} room type nights. Guests can
              book them now.
            </p>
          )}
          <p className={ui.note}>
            Price and room count are fixed once a night is open. Unsold rooms
            come back at release time.
          </p>
        </fieldset>
      </form>
    </aside>
  );
}
