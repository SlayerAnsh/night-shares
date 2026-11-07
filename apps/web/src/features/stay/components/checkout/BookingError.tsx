import { Button } from "@night-shares/design-system";
import { TxStatus } from "../../../../shared/tx/TxStatus";
import { txFailure } from "../../../../shared/tx/tx";
import { QueryState } from "../shared/QueryState";

const CHAIN = new Set(["confirming", "reverted", "one-night", "slippage"]);

const BOOKING_COPY: Record<string, string> = {
  reverted:
    "The payment was rejected on chain and no money moved. Go back to the stay for a fresh price, then book again.",
  slippage:
    "The price changed before the payment went through, so nothing was charged. Go back to the stay for a fresh price.",
  confirming:
    "Your payment was sent and is waiting for its receipt. Check again in a moment. You will not be charged twice.",
};

// A failed payment. Chain outcomes get their own block (still confirming can
// be checked again with the same lock, which the API books at most once);
// everything else stays the usual one line.
export function BookingError({
  error,
  onCheckAgain,
  checking,
}: {
  error: unknown;
  onCheckAgain: () => void;
  checking: boolean;
}) {
  if (!error) return null;
  const failure = txFailure(error);
  if (!CHAIN.has(failure.kind)) return <QueryState error={error} />;
  return (
    <TxStatus
      phase={failure.unknownOutcome ? "confirming" : "failed"}
      title={
        failure.kind === "reverted"
          ? "The booking did not go through"
          : failure.title
      }
      action={
        failure.unknownOutcome && (
          <Button size="sm" disabled={checking} onClick={onCheckAgain}>
            {checking ? "Checking…" : "Check again"}
          </Button>
        )
      }
    >
      {BOOKING_COPY[failure.kind] ?? failure.message}
    </TxStatus>
  );
}
