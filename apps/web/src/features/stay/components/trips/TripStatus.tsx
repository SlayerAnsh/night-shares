"use client";
import { Badge, Button, Spinner } from "@night-shares/design-system";
import type { Trip } from "@night-shares/proto/stay/v1/trip_pb";
import { useState } from "react";
import { formatUsdc } from "../../../../shared/format";
import type { useTripActions } from "../../hooks/use-trips";
import { QueryState } from "../shared/QueryState";
import { CheckInForm } from "./CheckInForm";
import styles from "./Trips.module.css";
import { WalkDialog } from "./WalkDialog";

type Actions = ReturnType<typeof useTripActions>;

// Status line and reception actions (.trip-foot, .trip-hint, .trip-walk).
export function TripStatus({
  trip,
  upcoming,
  action,
  hotel,
}: {
  trip: Trip;
  upcoming: boolean;
  action: Actions;
  hotel: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const walked = action.walk.data;
  const tapped = action.tap.isSuccess;
  const tapping = action.issue.isPending || action.tap.isPending;
  return (
    <>
      <div className={styles.foot}>
        <div className={styles.status}>
          {walked ? (
            <Badge tone="neg">Reported: not let in</Badge>
          ) : trip.checkedIn ? (
            <Badge tone="pos">Checked in with World ID</Badge>
          ) : tapped ? (
            <Badge tone="accent">At reception</Badge>
          ) : (
            <Badge>{upcoming ? "Not checked in yet" : "Not checked in"}</Badge>
          )}
          {!trip.checkedIn && !walked && (
            <>
              {!tapped && (
                <Button
                  size="sm"
                  disabled={tapping || action.walk.isSuccess}
                  onClick={() => void action.tapAtReception().catch(() => {})}
                >
                  {tapping ? (
                    <>
                      <Spinner label="Reading the tag" /> Reading the tag
                    </>
                  ) : (
                    "Tap at reception"
                  )}
                </Button>
              )}
              <Button
                size="sm"
                disabled={action.walk.isPending || action.walk.isSuccess}
                onClick={() => setConfirming(true)}
              >
                I was not let in
              </Button>
            </>
          )}
        </div>
        <button
          type="button"
          className={styles.link}
          aria-expanded={action.showReceipt}
          onClick={action.toggleReceipt}
        >
          {action.showReceipt ? "Hide receipt" : "Receipt"}
        </button>
      </div>
      {upcoming && !trip.checkedIn && !walked && (
        <CheckInForm action={action} />
      )}
      {!trip.checkedIn && !walked && (
        <p className={styles.hint}>
          {tapped
            ? "Reception presence recorded. If the hotel turns you away, report it within 24 hours after check-in time."
            : "At the hotel, tap your phone on the Night Shares tag at reception. It proves you were there, and a report that you were not let in needs it. Report within 24 hours after check-in time."}
        </p>
      )}
      <QueryState
        error={action.issue.error || action.tap.error || action.walk.error}
      />
      {walked && (
        <div className={styles.walk}>
          <b>
            Refunded{" "}
            <span className={styles.mono}>
              {formatUsdc(walked.paidToGuest?.micros ?? 0n)}
            </span>
          </b>
          <span>
            Full refund of what you paid, from the hotel. This is now a public
            incident on the hotel's record.
          </span>
        </div>
      )}
      <WalkDialog
        open={confirming}
        trip={trip}
        hotel={hotel}
        pending={action.walk.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={() =>
          action.walk.mutate(
            { bookingId: trip.id },
            { onSettled: () => setConfirming(false) },
          )
        }
      />
    </>
  );
}
