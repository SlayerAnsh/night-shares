import type { Payout } from "@night-shares/proto/host/v1/hotel_pb";
import Link from "next/link";
import type { ReactNode } from "react";
import { shortInstant } from "../../model/calendar";
import { usd } from "../../model/money";
import { cx } from "../ui/cx";
import { SyncPill } from "../ui/SyncPill";
import ui from "../ui/ui.module.css";
import styles from "./PayCard.module.css";

type Amount = { micros: bigint };
type PayoutLike = {
  availableNow?: Amount;
  heldForTraders?: Amount;
  fees?: Amount;
  sweptTotal?: Amount;
  lastSweepAt?: Payout["lastSweepAt"];
  lastSweepAmount?: Amount;
  lastSweepTransactionId?: string;
};

/** Earned USDC sweeps to the host's wallet on its own. There is nothing to withdraw. */
export function PayCard({
  id,
  title,
  href,
  subtitle,
  payout,
  children,
}: {
  id?: string;
  title: string;
  href?: string;
  subtitle: string;
  payout?: PayoutLike;
  children?: ReactNode;
}) {
  return (
    <section id={id} className={cx(ui.card, styles.card)} aria-label={title}>
      <div className={styles.head}>
        <div>
          <h2>{href ? <Link href={href}>{title}</Link> : title}</h2>
          <p className={ui.muted}>{subtitle}</p>
        </div>
        <SyncPill>Paid out automatically</SyncPill>
      </div>
      {children}
      {payout && (
        <>
          <div className={styles.grid}>
            <div className={cx(styles.tile, styles.main)}>
              <span className={styles.lbl}>Paid to your wallet</span>
              <span className={styles.v}>{usd(payout.sweptTotal?.micros)}</span>
              <p>
                Swept to your wallet as rooms sell. There is nothing to
                withdraw.
              </p>
            </div>
            <div className={styles.tile}>
              <span className={styles.lbl}>Sweeping next</span>
              <span className={styles.v}>
                {usd(payout.availableNow?.micros)}
              </span>
              <p>
                Earned and on its way. It goes out with the next automatic
                sweep.
              </p>
            </div>
            <div className={styles.tile}>
              <span className={styles.lbl}>Held while traders hold rooms</span>
              <span className={styles.v}>
                {usd(payout.heldForTraders?.micros)}
              </span>
              <p>
                Paid out automatically when a guest books one of these rooms.
              </p>
            </div>
            <div className={styles.tile}>
              <span className={styles.lbl}>Fee revenue</span>
              <span className={styles.v}>{usd(payout.fees?.micros)}</span>
              <p>
                Your 1% of every trade on your nights, paid as each trade
                happens.
              </p>
            </div>
          </div>
          {"lastSweepTransactionId" in payout && (
            <div className={styles.sweep}>
              {payout.lastSweepAt ? (
                <>
                  <span>
                    Last sweep <b>{usd(payout.lastSweepAmount?.micros)}</b> on{" "}
                    {shortInstant(payout.lastSweepAt)}
                  </span>
                  {payout.lastSweepTransactionId && (
                    <span className={styles.tx}>
                      Transaction {payout.lastSweepTransactionId}
                    </span>
                  )}
                </>
              ) : (
                <span>
                  No sweep yet. The first one runs as soon as money is earned.
                </span>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
