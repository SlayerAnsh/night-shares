import { txFailure } from "../../../shared/tx/tx";

type Entry = { data?: unknown; error?: unknown };

/** The API turned down a stay because on-chain bookings are 1 room x 1 night. */
export function isOneNightRejection(error: unknown): boolean {
  return !!error && txFailure(error).kind === "one-night";
}

/**
 * Whether stays book on chain, from what the API has already said: a quote
 * flagged on_chain, or a quote turned down for the 1 room x 1 night limit.
 * Unknown (false) until one of those arrives, so mock mode shows nothing.
 */
export function staysOnChain(entries: Entry[]): boolean {
  return entries.some(({ data, error }) => {
    const result = data as
      | {
          onChain?: boolean;
          property?: { onChain?: boolean };
          quote?: { onChain?: boolean };
        }
      | undefined;
    return (
      result?.onChain === true ||
      result?.property?.onChain === true ||
      result?.quote?.onChain === true ||
      isOneNightRejection(error)
    );
  });
}

/** Whether a selection goes past the on-chain limit. */
export function overOneNight(nights: number, rooms: number): boolean {
  return nights > 1 || rooms > 1;
}
