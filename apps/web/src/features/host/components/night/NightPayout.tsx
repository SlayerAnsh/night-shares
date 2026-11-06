import type { Payout } from "@night-shares/proto/host/v1/hotel_pb";
import Link from "next/link";
import { usd } from "../../model/money";
import ui from "../ui/ui.module.css";
import styles from "./NightPayout.module.css";

/** Payout for one night. It sweeps on its own, so there is nothing to withdraw here. */
export function NightPayout({
  payout,
  propertyId,
  hotel,
}: {
  payout?: Payout;
  propertyId: string;
  hotel: string;
}) {
  return (
    <>
      <div className={styles.pay}>
        <span>Earned so far</span>
        <b>{usd(payout?.availableNow?.micros)}</b>
      </div>
      <div className={styles.kv}>
        <span>Held while traders hold rooms</span>
        <b>{usd(payout?.heldForTraders?.micros)}</b>
      </div>
      <div className={styles.kv}>
        <span>Fee revenue</span>
        <b className={styles.pos}>{usd(payout?.fees?.micros)}</b>
      </div>
      <div className={styles.kv}>
        <span>Gross, if held rooms are booked</span>
        <b>{usd(payout?.gross?.micros)}</b>
      </div>
      <p className={ui.note}>
        Paid out automatically to your wallet. Money held for traders follows
        when a guest books. See the{" "}
        <Link className={ui.link} href={`/host/payout?property=${propertyId}`}>
          {hotel} payout
        </Link>
        .
      </p>
    </>
  );
}
