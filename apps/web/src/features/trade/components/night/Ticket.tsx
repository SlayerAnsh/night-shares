"use client";
import type { NightKey } from "@night-shares/proto/common/v1/night_pb";
import { useTicket } from "../../hooks/use-ticket";
import { Feedback } from "../shared/Feedback";
import { QuotePreview } from "./QuotePreview";
export function Ticket({
  night,
  fair,
  cap,
}: {
  night: Pick<NightKey, "propertyId" | "roomTypeId" | "date">;
  fair?: bigint;
  cap?: bigint;
}) {
  const t = useTicket(night);
  return (
    <section>
      <h2>Trade this market</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (t.valid) void t.submit();
        }}
      >
        <label>
          Action{" "}
          <select
            value={t.mode}
            onChange={(event) => t.update({ mode: event.target.value })}
          >
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
            <option value="ask">Post ask</option>
          </select>
        </label>{" "}
        <label>
          Room nights{" "}
          <input
            required
            type="number"
            min="0.1"
            step="0.1"
            value={t.amount}
            onChange={(event) => t.update({ size: event.target.value })}
          />
        </label>
        {t.mode === "ask" && (
          <>
            <label>
              Ask price, USDC{" "}
              <input
                required
                type="number"
                min="0.000001"
                step="0.000001"
                value={t.price}
                onChange={(event) => t.update({ price: event.target.value })}
              />
            </label>
            {t.micros !== null &&
              fair !== undefined &&
              t.micros > fair * 2n && (
                <p role="note">
                  Above twice fair price. Nothing comes back if unsold.
                </p>
              )}
            {t.micros !== null && cap !== undefined && t.micros > cap && (
              <p role="note">
                Above recall cap. Guests can book at the recall cap instead.
              </p>
            )}
          </>
        )}
        {t.mode !== "ask" && (
          <>
            {t.preview.isFetching && <p>Updating quote…</p>}
            <Feedback error={t.preview.error?.message} />
            {t.quote && <QuotePreview quote={t.quote} mode={t.mode} />}
          </>
        )}
        <button type="submit" disabled={!t.valid || t.actions.pending}>
          {t.actions.pending
            ? "Submitting…"
            : t.mode === "buy"
              ? "Buy"
              : t.mode === "sell"
                ? "Sell"
                : "Post ask"}
        </button>
        <Feedback error={t.actions.error} notice={t.actions.notice} />
      </form>
    </section>
  );
}
