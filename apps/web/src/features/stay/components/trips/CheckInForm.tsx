"use client";
import { Button, Field, Input } from "@night-shares/design-system";
import type { useTripActions } from "../../hooks/use-trips";
import { QueryState } from "../shared/QueryState";
import styles from "./Trips.module.css";

// World ID check in at the property. The seed stands in for the World App
// in the mock sign in flow.
export function CheckInForm({
  action,
}: {
  action: ReturnType<typeof useTripActions>;
}) {
  const busy = action.verify.isPending || action.check.isPending;
  return (
    <form
      className={styles.checkin}
      onSubmit={(e) => {
        e.preventDefault();
        void action.confirm().catch(() => {});
      }}
    >
      <Field label="Mock sign-in seed" className={styles.seed}>
        <Input
          required
          value={action.seed}
          onChange={(e) => action.setSeed(e.target.value)}
        />
      </Field>
      <Button type="submit" size="sm" variant="secondary" disabled={busy}>
        {busy ? "Verifying with World ID" : "Check in with World ID"}
      </Button>
      <QueryState error={action.verify.error || action.check.error} />
    </form>
  );
}
