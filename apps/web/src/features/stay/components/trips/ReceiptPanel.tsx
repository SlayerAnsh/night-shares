import { formatUsdc } from "../../../../shared/format";
import type { useTripActions } from "../../hooks/use-trips";
import { QueryState } from "../shared/QueryState";
import styles from "./Trips.module.css";

const paidAt = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function ReceiptPanel({
  action,
}: {
  action: ReturnType<typeof useTripActions>;
}) {
  const receipt = action.receipt.data?.receipt;
  return (
    <section className={styles.receipt} aria-label="Receipt">
      <QueryState
        pending={action.receipt.isPending}
        error={action.receipt.error}
      />
      {receipt && (
        <dl className={styles.lines}>
          <div>
            <dt>Subtotal</dt>
            <dd className={styles.mono}>
              {formatUsdc(receipt.subtotal?.micros ?? 0n)}
            </dd>
          </div>
          <div>
            <dt>Booking fee</dt>
            <dd className={styles.mono}>
              {formatUsdc(receipt.trip?.fee?.micros ?? 0n)}
            </dd>
          </div>
          <div className={styles.tot}>
            <dt>Total paid</dt>
            <dd className={styles.mono}>
              {formatUsdc(receipt.trip?.total?.micros ?? 0n)}
            </dd>
          </div>
          <div>
            <dt>Wallet</dt>
            <dd className={`${styles.mono} ${styles.addr}`}>
              {receipt.walletAddress}
            </dd>
          </div>
          <div>
            <dt>Paid at</dt>
            <dd>
              {receipt.paidAt
                ? paidAt.format(Number(receipt.paidAt.seconds) * 1000)
                : "Unavailable"}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
