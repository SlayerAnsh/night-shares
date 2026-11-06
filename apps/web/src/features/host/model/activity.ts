import type { Activity } from "@night-shares/proto/host/v1/hotel_pb";

export function activityLabel(kind: string) {
  return (
    (
      {
        guest_booked: "Guest booked",
        double_sale_reported: "Guest reported being walked",
        double_sale_refund: "Walked guest payout",
        trader_bought: "Trader took rooms",
        trader_sold_back: "Trader returned rooms",
        ask_filled: "Rooms sold for a trader",
        ask_posted: "Trader offered rooms for sale",
        ask_cancelled: "Trader stopped offering rooms",
        nights_opened: "Nights opened",
        nights_edited: "Rooms and demand updated",
        selling_stopped: "Selling stopped",
      } as Record<string, string>
    )[kind] ?? kind.replaceAll("_", " ")
  );
}

export function activityRows(events: Activity[]) {
  const rows = new Map<
    string,
    {
      key: string;
      at: Activity["at"];
      kind: string;
      tenths: number;
      micros: bigint;
    }
  >();
  for (const event of events) {
    // The API omits event IDs and room types, so combine simultaneous events of the same kind.
    const key = `${event.at?.seconds}:${event.at?.nanos}:${event.kind}`;
    const row = rows.get(key) ?? {
      key,
      at: event.at,
      kind: event.kind,
      tenths: 0,
      micros: 0n,
    };
    row.tenths += event.size?.tenths ?? 0;
    row.micros += event.amount?.micros ?? 0n;
    rows.set(key, row);
  }
  return [...rows.values()];
}

export type ActivityTone =
  | "open"
  | "guest"
  | "trader"
  | "back"
  | "fill"
  | "walk";

export function activityTone(kind: string): ActivityTone {
  if (kind.startsWith("double_sale")) return "walk";
  if (kind === "guest_booked") return "guest";
  if (kind === "trader_bought") return "trader";
  if (kind === "trader_sold_back" || kind === "ask_cancelled") return "back";
  if (kind === "ask_filled" || kind === "ask_posted") return "fill";
  return "open";
}
