import { createHash } from "node:crypto";

/** Payload the API attester will sign. Only the attester submits walk reports to Settlement. */
export interface WalkAttestation {
  reportId: string;
  bookingId: string;
  propertyId: string;
  humanId: string;
  reportedAt: number;
  evidenceHash: string;
}

export function tapEvidenceHash(
  tap: {
    tagUid: string;
    counter: bigint;
    tapAt: number;
  },
  bookingId: string,
): string {
  return createHash("sha256")
    .update(`${tap.tagUid}|${tap.counter}|${tap.tapAt}|${bookingId}`)
    .digest("hex");
}
