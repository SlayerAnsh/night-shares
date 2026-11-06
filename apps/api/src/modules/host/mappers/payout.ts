import { HOST_FEE, hostPayout, toMicros } from "@night-shares/market-model";
import type { NightRecord } from "../../inventory/inventory-repo";
export function payoutOf(records: NightRecord[], withdrawn = 0n) {
  let available = 0n,
    held = 0n,
    fees = 0n,
    gross = 0n;
  for (const { state } of records) {
    const pay = hostPayout(state);
    const fee =
      (toMicros(pay.gross) * BigInt(Math.round(HOST_FEE * 10_000))) / 10_000n;
    available += toMicros(pay.availableNow) + fee;
    held += toMicros(pay.heldForTraders);
    fees += fee;
    gross += toMicros(pay.gross);
  }
  return {
    availableNow: {
      micros: available > withdrawn ? available - withdrawn : 0n,
    },
    heldForTraders: { micros: held },
    fees: { micros: fees },
    gross: { micros: gross },
  };
}
