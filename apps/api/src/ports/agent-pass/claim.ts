import { CheckpointFailure } from "./failure";
import type { CheckpointStore } from "./store";
export function claimCheckpoint(store: CheckpointStore, state: string) {
  const a = store.byState(state);
  if (a?.status !== "pending" || a.claimed)
    throw new CheckpointFailure(
      a?.status === "expired" ? "expired" : "mismatch",
    );
  // Claim before any network await. Failed redemption cannot be retried.
  a.claimed = true;
  store.save(a);
  return a;
}
