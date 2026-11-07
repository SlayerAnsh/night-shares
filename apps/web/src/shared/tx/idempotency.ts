// The API accepts 1 to 128 letters, digits, "_" or "-" in idempotency-key.
const VALID = /^[a-zA-Z0-9_-]{1,128}$/;

export const IDEMPOTENCY_HEADER = "idempotency-key";

export function isIdempotencyKey(value: string): boolean {
  return VALID.test(value);
}

function randomKey(): string {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `web-${id}`;
}

export type Attempt<R> = { key: string; request: R };

/**
 * One idempotency key per click. A retry after an unknown outcome (the
 * receipt was still pending, or the connection dropped) must resend the same
 * request with the same key, so the API returns the first result instead of
 * trading twice. Any settled outcome clears it, so the next click is new.
 */
export class AttemptKeeper<R> {
  private current: Attempt<R> | undefined;

  constructor(private readonly makeKey: () => string = randomKey) {}

  /** A fresh key for a new click, unless an unknown outcome is waiting. */
  begin(request: R): Attempt<R> {
    this.current ??= { key: this.makeKey(), request };
    return this.current;
  }

  /** The attempt whose outcome is still unknown, if any. */
  get unresolved(): Attempt<R> | undefined {
    return this.current;
  }

  /** Keep the attempt only when the chain may still have it. */
  settle(unknownOutcome: boolean): void {
    if (!unknownOutcome) this.current = undefined;
  }
}
