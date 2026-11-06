import type { OpenNightPreview } from "@night-shares/proto/host/v1/opening_pb";

export type PreviewRow = {
  roomTypeId: string;
  nights: number;
  allotment: number;
  floor: bigint;
  lastRoom: bigint;
  cap: bigint;
  minimumPayout: bigint;
};

/** Preview per room type: prices averaged over the nights, room counts and payout summed. */
export function previewByRoomType(nights: OpenNightPreview[]): PreviewRow[] {
  const rows = new Map<string, PreviewRow>();
  for (const night of nights) {
    const id = night.night?.roomTypeId ?? "";
    const row = rows.get(id) ?? {
      roomTypeId: id,
      nights: 0,
      allotment: 0,
      floor: 0n,
      lastRoom: 0n,
      cap: 0n,
      minimumPayout: 0n,
    };
    row.nights += 1;
    row.allotment += night.allotment?.tenths ?? 0;
    row.floor += night.floor?.micros ?? 0n;
    row.lastRoom += night.lastRoomPrice?.micros ?? 0n;
    row.cap += night.guestPriceCap?.micros ?? 0n;
    row.minimumPayout += night.minimumPayout?.micros ?? 0n;
    rows.set(id, row);
  }
  return [...rows.values()].map((row) => {
    const n = BigInt(row.nights);
    return {
      ...row,
      floor: row.floor / n,
      lastRoom: row.lastRoom / n,
      cap: row.cap / n,
    };
  });
}
