import { Button } from "@night-shares/design-system";
import { formatUsdc } from "../../../../shared/format";
import type { useTicket } from "../../hooks/use-ticket";
import { usd } from "../../model/display";
import { parseTenths } from "../../model/market";
import { Stepper } from "../ui/Stepper";
import { TradeResult } from "./TradeResult";
import styles from "./ticket.module.css";

// List at your own price: price, size, what it brings if it sells.
export function TicketAsk({
  ticket: t,
  fair,
  cap,
  signedIn,
}: {
  ticket: ReturnType<typeof useTicket>;
  fair?: bigint;
  cap?: bigint;
  signedIn: boolean;
}) {
  const tenths = parseTenths(t.amount);
  const total =
    t.micros !== null && tenths !== null
      ? (t.micros * BigInt(tenths)) / 10n
      : 0n;
  const label = !signedIn
    ? "Sign in with World ID to list"
    : t.tx.pending
      ? "Posting…"
      : `List ${t.amount || 0} room nights at ${usd(t.micros ?? 0n, 2)}`;
  return (
    <>
      <div>
        <label className={styles.lab} htmlFor="tk-price">
          Your price per room night
        </label>
        <div className={styles.price}>
          <span>$</span>
          <input
            id="tk-price"
            type="number"
            inputMode="decimal"
            required
            min="0.000001"
            step="0.000001"
            value={t.price}
            onChange={(event) => t.update({ price: event.target.value })}
          />
        </div>
        {fair !== undefined && (
          <Button
            variant="text"
            className={styles.actStart}
            onClick={() =>
              t.update({
                price: formatUsdc(fair, { suffix: false }).replace(/,/g, ""),
              })
            }
          >
            Use the fair price, {usd(fair)}
          </Button>
        )}
      </div>
      <Stepper
        id="tk-size"
        label="Room nights to list"
        value={t.amount}
        onChange={(size) => t.update({ size })}
      />
      <div className={styles.total}>
        <span>If it sells</span>
        <b>{usd(total, 2)}</b>
      </div>
      <Button
        variant="primary"
        size="lg"
        block
        className={styles.go}
        type="submit"
        disabled={signedIn && (!t.valid || t.tx.pending)}
      >
        {label}
      </Button>
      <TradeResult tx={t.tx.state} />
      <Button
        variant="text"
        className={styles.act}
        onClick={() => t.update({ mode: "sell" })}
      >
        Back to sell
      </Button>
      <ul className={styles.lines}>
        {t.micros !== null && fair !== undefined && t.micros > fair * 2n && (
          <li className={styles.warn} role="note">
            Above twice the fair price. Nothing comes back if unsold.
          </li>
        )}
        {t.micros !== null && cap !== undefined && t.micros > cap && (
          <li className={styles.warn} role="note">
            Above the guest price cap ({usd(cap)}). Guests can book at the
            recall cap instead, so only traders can buy at this price.
          </li>
        )}
        <li>Other traders and guests can buy from you until release.</li>
      </ul>
    </>
  );
}
