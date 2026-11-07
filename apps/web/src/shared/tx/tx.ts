import { Code, ConnectError } from "@connectrpc/connect";
import { errorCopy } from "../fallback/error-copy";

// A transaction hash on Arc: 0x and 64 hex digits.
const HASH = /^0x[0-9a-fA-F]{64}$/;

export function isTxHash(value: unknown): value is string {
  return typeof value === "string" && HASH.test(value);
}

/** 0x1234…abcd, for a hash shown in a line of text. */
export function shortHash(hash: string, head = 6, tail = 4): string {
  return hash.length <= head + tail + 1
    ? hash
    : `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

// Names the API uses (or may add) for the transaction behind a result:
// Trip.chain_transaction_hash today; a trade Execution has none yet.
const HASH_FIELDS = ["chainTransactionHash", "transactionHash", "txHash"];

/** The transaction hash carried by an API result, if it has one. */
export function txHashOf(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const record = result as Record<string, unknown>;
  for (const field of HASH_FIELDS)
    if (isTxHash(record[field])) return record[field];
  return undefined;
}

/** A link to the hash, only when the API names an explorer. */
export function explorerTxUrl(
  explorerUrl: string | undefined,
  hash: string,
): string | undefined {
  if (!explorerUrl || !/^https?:\/\//.test(explorerUrl)) return undefined;
  return `${explorerUrl.replace(/\/+$/, "")}/tx/${hash}`;
}

export type TxFailureKind =
  | "confirming"
  | "slippage"
  | "reverted"
  | "paused"
  | "cap"
  | "one-night"
  | "liquidity"
  | "balance"
  | "busy"
  | "other";

export type TxFailure = {
  kind: TxFailureKind;
  title: string;
  message: string;
  // The request may have reached the chain: retry with the same key.
  unknownOutcome: boolean;
};

const PREFIXED = /^\[([a-z_]+)\]\s*/;

function rawOf(error: unknown): string {
  if (error instanceof ConnectError) return error.rawMessage;
  const text =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";
  return text.replace(PREFIXED, "").trim();
}

const RULES: [RegExp, TxFailureKind, string, string][] = [
  [
    /pending reconciliation|is pending\b/i,
    "confirming",
    "Still confirming on chain",
    "Your transaction was sent and is waiting for its receipt. Check again in a moment. It will not be sent twice.",
  ],
  [
    /price moved|slippage/i,
    "slippage",
    "The price moved",
    "The price changed by more than your 0.5% limit before the order went through, so nothing was traded. Check the new quote and try again.",
  ],
  [
    /reverted/i,
    "reverted",
    "The transaction did not go through",
    "It was rejected on chain and no money moved. Get a fresh quote and try again.",
  ],
  [
    /paused/i,
    "paused",
    "Trading is paused",
    "Orders are on hold for now. Prices and your positions stay visible, and orders open again soon.",
  ],
  [
    /cap exceeded/i,
    "cap",
    "Over your World ID limit",
    "Each person can hold only a set amount of one night, and this order goes past it. Try a smaller amount.",
  ],
  [
    /exactly 1 room for 1 night/i,
    "one-night",
    "On-chain stays are 1 room for 1 night",
    "Choose a single room and a single night, then try again.",
  ],
  [
    /not enough (trader )?liquidity|not enough room nights/i,
    "liquidity",
    "Not enough room nights for sale",
    "There are not enough room nights at this price right now. Try a smaller amount.",
  ],
  [
    /insufficient usdc/i,
    "balance",
    "Not enough USDC",
    "Your wallet does not hold enough USDC for this. Add funds or try a smaller amount.",
  ],
];

const UNKNOWN_OUTCOME = new Set([
  Code.Unavailable,
  Code.DeadlineExceeded,
  Code.Internal,
  Code.Unknown,
]);

/** Plain words for a failed write, and whether the outcome is still unknown. */
export function txFailure(error: unknown): TxFailure {
  const raw = rawOf(error);
  for (const [pattern, kind, title, message] of RULES)
    if (pattern.test(raw))
      return { kind, title, message, unknownOutcome: kind === "confirming" };
  if (/another .*(operation|cancellation).* pending/i.test(raw))
    return {
      kind: "busy",
      title: "Another order is still confirming",
      message: "Wait for it to finish, then try again.",
      unknownOutcome: false,
    };
  const copy = errorCopy(error);
  // Network loss, timeouts and server faults after sending: it may have landed.
  const unknownOutcome = UNKNOWN_OUTCOME.has(copy.code);
  return {
    kind: "other",
    title: copy.title,
    message: copy.message,
    unknownOutcome,
  };
}
