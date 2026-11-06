export type ActivityKind =
  | "guest_booked"
  | "trader_bought"
  | "trader_sold_back"
  | "ask_filled"
  | "ask_posted"
  | "ask_cancelled"
  | "nights_opened"
  | "nights_edited"
  | "selling_stopped";

export type ActivityEvent = {
  id: string;
  at: number;
  nightKey: string;
  propertyId: string;
  kind: ActivityKind;
  tenths: number;
  priceMicros?: bigint;
  actor: "guest" | "trader" | "you" | "host" | "agent" | "pool";
  userId?: string;
};

export interface ActivityLog {
  append(event: Omit<ActivityEvent, "id" | "at">): ActivityEvent;
  list(filter: {
    nightKey?: string;
    propertyId?: string;
    kinds?: ActivityKind[];
    limit?: number;
  }): ActivityEvent[];
}
