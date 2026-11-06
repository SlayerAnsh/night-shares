import { Code, ConnectError } from "@connectrpc/connect";

export type ErrorCopy = {
  code: Code;
  title: string;
  message: string;
  // Trying again can help (network, timeouts, server hiccups).
  canRetry: boolean;
  // Signing in again is the fix.
  needsSignIn: boolean;
};

// "[not_found] Property not found." is how ConnectError.message reads, and
// some screens only keep that string.
const PREFIXED = /^\[([a-z_]+)\]\s*/;
const NETWORK =
  /fetch failed|failed to fetch|network|load failed|ECONNREFUSED/i;

function codeOf(name: string): Code {
  const key = name
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("") as keyof typeof Code;
  return Code[key] ?? Code.Unknown;
}

// plain: a message written for people (a thrown Error or a string with no code).
function readError(error: unknown): {
  code: Code;
  raw: string;
  plain: boolean;
} {
  if (error instanceof ConnectError)
    return { code: error.code, raw: error.rawMessage, plain: false };
  const text =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";
  const name = PREFIXED.exec(text)?.[1];
  return {
    code: name ? codeOf(name) : Code.Unknown,
    raw: text.replace(PREFIXED, "").trim(),
    plain: !name && text.length > 0,
  };
}

function copy(
  code: Code,
  title: string,
  message: string,
  canRetry = false,
  needsSignIn = false,
): ErrorCopy {
  return { code, title, message, canRetry, needsSignIn };
}

/**
 * Human copy for a failed call. Codes never reach the screen; API messages
 * are shown only for codes where the API writes them for people to read.
 * `thing` names what failed to load, for example "This stay".
 */
export function errorCopy(error: unknown, thing = "This page"): ErrorCopy {
  const { code, raw, plain } = readError(error);
  if (NETWORK.test(raw) || code === Code.Unavailable)
    return copy(
      Code.Unavailable,
      "Night Shares is out of reach",
      "We could not reach the server. Check your connection, then try again.",
      true,
    );
  switch (code) {
    case Code.Unauthenticated:
      return copy(
        code,
        "Sign in to continue",
        "Your session has ended. Sign in with World ID again to carry on.",
        false,
        true,
      );
    case Code.PermissionDenied:
      return copy(
        code,
        "Not open to this account",
        "This needs a different World ID level, or it belongs to another account.",
      );
    case Code.NotFound:
      return copy(
        code,
        `${thing} could not be found`,
        "It may have been removed, or the link is not quite right.",
      );
    case Code.FailedPrecondition:
      return /paused/i.test(raw)
        ? copy(
            code,
            "Trading is paused",
            "Trading is paused. Prices and your positions stay visible, and orders open again soon.",
            true,
          )
        : copy(code, "This cannot be done right now", raw || "Try again soon.");
    case Code.InvalidArgument:
    case Code.ResourceExhausted:
    case Code.AlreadyExists:
      return copy(
        code,
        "Please check and try again",
        raw || "Check the details and try again.",
      );
    case Code.DeadlineExceeded:
      return copy(
        code,
        "That took too long",
        "The server did not answer in time. Try again.",
        true,
      );
    default:
      return copy(
        code,
        "Something went wrong",
        plain
          ? raw
          : "This did not load. Try again, and if it keeps happening reload the page.",
        true,
      );
  }
}

/** Codes where a second attempt cannot help, so queries fail fast. */
export function isRetryable(error: unknown): boolean {
  return errorCopy(error).canRetry;
}

/** One sentence for an inline error line: the API's own words when written for people, else title and message. */
export function errorLine(error: unknown, thing?: string): string {
  const copy = errorCopy(error, thing);
  const { plain, raw } = readError(error);
  if (plain && copy.code === Code.Unknown) return raw;
  return `${copy.title}. ${copy.message}`;
}
