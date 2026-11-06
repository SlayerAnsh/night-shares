import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import type { StayRepo } from "../../repo/stay-repo";
import { getTrip } from "./get-trip";
export function createGetReceipt(repo: StayRepo) {
  return (id: string, userId: string) => {
    const saved = getTrip(repo, id, userId);
    return {
      trip: structuredClone(saved.trip),
      subtotal: {
        micros:
          (saved.trip.total?.micros ?? 0n) - (saved.trip.fee?.micros ?? 0n),
      },
      walletAddress: saved.walletAddress,
      paidAt: timestampFromMs(saved.paidAt),
    };
  };
}
