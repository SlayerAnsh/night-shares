import { HOST_FEE, hostPayout, toMicros } from "@night-shares/market-model";
import type { NightRecord } from "../../inventory/inventory-repo";
export function payoutOf(records: NightRecord[], withdrawn = 0n) {
  let available = 0n,
    held = 0n,
    bond = 0n,
    target = 0n,
    fees = 0n,
    gross = 0n;
  for (const { state } of records) {
    const pay = hostPayout(state);
    const fee =
      (toMicros(pay.gross) * BigInt(Math.round(HOST_FEE * 10_000))) / 10_000n;
    available += toMicros(pay.availableNow) + fee;
    held += toMicros(pay.heldForTraders);
    bond += toMicros(pay.bondHeld);
    target += toMicros(pay.bondTarget);
    fees += fee;
    gross += toMicros(pay.gross);
  }
  return {
    availableNow: {
      micros: available > withdrawn ? available - withdrawn : 0n,
    },
    heldForTraders: { micros: held },
    securityHold: { micros: bond },
    securityHoldTarget: { micros: target },
    fees: { micros: fees },
    gross: { micros: gross },
  };
}
