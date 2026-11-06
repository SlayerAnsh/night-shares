import { formatRoomNights } from "../../../../shared/format";
import type { useTicket } from "../../hooks/use-ticket";
import { usd } from "../../model/display";
import { parseTenths } from "../../model/market";
import { Button } from "../ui/Button";
import { Stepper } from "../ui/Stepper";
import { QuotePreview } from "./QuotePreview";
import styles from "./ticket.module.css";

const QUICK = ["0.5", "1", "2"];

// Buy or sell: amount, total, one primary button, then the quote lines.
export function TicketTrade({
  ticket: t,
  signedIn,
}: {
  ticket: ReturnType<typeof useTicket>;
  signedIn: boolean;
}) {
  const isSell = t.mode === "sell";
  const tenths = parseTenths(t.amount);
  const size = tenths === null ? "0" : formatRoomNights(tenths);
  const verb = isSell ? "Sell" : "Buy";
  const label = !signedIn
    ? "Sign in with World ID to trade"
    : t.actions.pending
      ? "Submitting…"
      : `${verb} ${size} room night${tenths === 10 ? "" : "s"}`;
  return (
    <>
      <Stepper
        id="tk-amt"
        label="Room nights"
        value={t.amount}
        onChange={(size) => t.update({ size })}
      />
      <div className={styles.quick}>
        {QUICK.map((amount) => (
          <button
            key={amount}
            type="button"
            aria-pressed={t.amount === amount}
            onClick={() => t.update({ size: amount })}
          >
            {amount}
          </button>
        ))}
      </div>
      <div className={styles.total}>
        <span>{isSell ? "You get" : "Total"}</span>
        <b>
          {t.preview.isFetching && !t.quote
            ? "…"
            : usd(t.quote?.total?.micros ?? 0n, 2)}
        </b>
      </div>
      <Button
        variant="go"
        type="submit"
        disabled={signedIn && (!t.valid || t.actions.pending)}
      >
        {label}
      </Button>
      {isSell && (
        <Button
          variant="text"
          className={styles.act}
          onClick={() => t.update({ mode: "ask" })}
        >
          List at your own price
        </Button>
      )}
      {t.preview.error && (
        <p role="alert" className={styles.warn}>
          {t.preview.error.message}
        </p>
      )}
      {t.quote && <QuotePreview quote={t.quote} mode={t.mode} />}
      {t.preview.isFetching && (
        <p className={styles.updating} role="status">
          Updating quote…
        </p>
      )}
    </>
  );
}
