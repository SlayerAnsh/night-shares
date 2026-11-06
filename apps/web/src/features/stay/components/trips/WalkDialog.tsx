"use client";
import { Alert, Button, Dialog, Spinner } from "@night-shares/design-system";
import type { Trip } from "@night-shares/proto/stay/v1/trip_pb";
import { formatUsdc } from "../../../../shared/format";
import styles from "./Trips.module.css";

// Confirmation for "I was not let in" (.g-walk). The refund is what the guest
// paid; the server sends the final amount back.
export function WalkDialog({
  open,
  trip,
  hotel,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  trip: Trip;
  hotel: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="You were not let in">
      <div className={styles.gwalk}>
        <p className={styles.muted}>
          {hotel} · booking {trip.ref}. This needs your tap at reception and no
          World ID check in for this booking.
        </p>
        <div className={styles.amt}>
          <span>The hotel refunds you</span>
          <b className={styles.mono}>{formatUsdc(trip.total?.micros ?? 0n)}</b>
          <em>Full refund of what you paid.</em>
        </div>
        <p className={styles.note}>
          Your report becomes a public incident on the hotel's record.
        </p>
        <Alert live={false}>
          Only report this if it is true. A false report gets your World ID
          banned from Night Shares.
        </Alert>
        <div className={styles.walkCta}>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={pending} onClick={onConfirm}>
            {pending ? (
              <>
                <Spinner label="Sending your report" /> Sending your report
              </>
            ) : (
              "Report and get a full refund"
            )}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
