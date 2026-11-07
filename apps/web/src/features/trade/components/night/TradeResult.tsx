import { formatRoomNights } from "../../../../shared/format";
import { TxStatus } from "../../../../shared/tx/TxStatus";
import type { TradeRequest, TradeTx } from "../../hooks/use-trade-tx";
import { usd } from "../../model/display";

const rn = (tenths = 0) =>
  `${formatRoomNights(tenths)} room night${tenths === 10 ? "" : "s"}`;

function sizeOf(request: TradeRequest) {
  return request.input.size?.tenths ?? 0;
}

const DOING = { buy: "Buying", sell: "Selling", ask: "Listing" } as const;

// Under the order button: sending, confirmed with the API's receipt figures,
// still confirming (the order button turns into "Check again"), or failed in plain words.
export function TradeResult({ tx }: { tx: TradeTx }) {
  if (tx.phase === "idle") return null;
  const { mode } = tx.request;
  if (tx.phase === "pending")
    return (
      <TxStatus
        phase="pending"
        title={`${DOING[mode]} ${rn(sizeOf(tx.request))}`}
      >
        {mode === "ask"
          ? "Posting your listing."
          : "Sent. Waiting for the receipt, which can take a few seconds."}
      </TxStatus>
    );
  if (tx.phase === "failed")
    return (
      <TxStatus
        phase={tx.failure.unknownOutcome ? "confirming" : "failed"}
        title={tx.failure.title}
      >
        {tx.failure.message}
      </TxStatus>
    );
  if (tx.ask)
    return (
      <TxStatus phase="confirmed" title="Listing posted">
        {rn(tx.ask.size?.tenths)} at {usd(tx.ask.price?.micros, 2)} each.
        Traders and guests can buy it until release.
      </TxStatus>
    );
  const q = tx.execution?.quote;
  const filled = q?.filled?.tenths ?? sizeOf(tx.request);
  return (
    <TxStatus
      phase="confirmed"
      title={`${mode === "sell" ? "Sold" : "Bought"} ${rn(filled)}`}
      hash={tx.hash}
    >
      {q?.total
        ? mode === "sell"
          ? `You got ${usd(q.total.micros, 2)} after the ${usd(q.fee?.micros, 2)} fee.`
          : `You paid ${usd(q.total.micros, 2)}, including the ${usd(q.fee?.micros, 2)} fee.`
        : "Your position is updated."}
      {q?.average && ` Average ${usd(q.average.micros, 2)} per room night.`}
    </TxStatus>
  );
}
