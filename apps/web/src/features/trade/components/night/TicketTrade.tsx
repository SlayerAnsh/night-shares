import { Button } from "@night-shares/design-system";
import { errorLine } from "../../../../shared/fallback/error-copy";
import { formatRoomNights } from "../../../../shared/format";
import type { useTicket } from "../../hooks/use-ticket";
import { usd } from "../../model/display";
import { parseTenths } from "../../model/market";
import { slippageLabel } from "../../model/slippage";
import { Stepper } from "../ui/Stepper";
import { QuotePreview } from "./QuotePreview";
import { TradeResult } from "./TradeResult";
import styles from "./ticket.module.css";

const QUICK = ["0.5", "1", "2"];

// Buy or sell: amount, total, one primary button, then the quote lines.
export function TicketTrade({
  ticket: t,
  signedIn,
  tradingPaused = false,
}: {
  ticket: ReturnType<typeof useTicket>;
  signedIn: boolean;
  tradingPaused?: boolean;
}) {
  const isSell = t.mode === "sell";
  const tenths = parseTenths(t.amount);
  const size = tenths === null ? "0" : formatRoomNights(tenths);
  const verb = isSell ? "Sell" : "Buy";
  const label = !signedIn
    ? "Sign in with World ID to trade"
    : t.tx.pending
      ? "Waiting for the receipt…"
      : t.tx.unresolved
        ? "Check again"
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
      {t.limit !== undefined && (
        <p className={styles.updating}>
          Price protection {slippageLabel()}: you{" "}
          {isSell ? "get at least" : "pay at most"} {usd(t.limit, 2)}, or
          nothing trades.
        </p>
      )}
      <Button
        variant="primary"
        size="lg"
        block
        className={styles.go}
        type="submit"
        disabled={
          tradingPaused ||
          (signedIn && (t.tx.pending || (!t.valid && !t.tx.unresolved)))
        }
      >
        {label}
      </Button>
      <TradeResult tx={t.tx.state} />
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
          {errorLine(t.preview.error, "This market")}
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
