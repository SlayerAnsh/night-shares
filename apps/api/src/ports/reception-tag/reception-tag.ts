export interface ReceptionTag {
  verify(input: {
    payload: string;
    propertyId: string;
    bookingId: string;
    now: number;
  }):
    | { ok: true; tagId: string; tagUid: string; counter: bigint }
    | { ok: false; reason: string };
}
