export type ActivityKind =
  | "night_released"
  | "cutoff_refund"
  | "guest_booked"
  | "trader_bought"
  | "trader_sold_back"
  | "ask_filled"
  | "ask_posted"
  | "ask_cancelled"
  | "nights_opened"
  | "nights_edited"
  | "selling_stopped"
  | "maker_rebate"
  | "double_sale_reported"
  | "double_sale_refund"
  | "channel_push_failed"
  | "agent_wallet_funded"
  | "agent_order_filled";

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
